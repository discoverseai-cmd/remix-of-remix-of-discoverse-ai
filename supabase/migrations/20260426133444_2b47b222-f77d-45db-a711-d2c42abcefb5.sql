-- Enable pgvector for semantic memory
CREATE EXTENSION IF NOT EXISTS vector;

-- =========================================
-- agent_runs: one row per autonomous run
-- =========================================
CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  message_id uuid,
  status text NOT NULL DEFAULT 'queued', -- queued | running | completed | failed | aborted_no_credits | cancelled
  model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  input text NOT NULL DEFAULT '',
  final_output text,
  error text,
  credits_spent integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_runs_user ON public.agent_runs(user_id, created_at DESC);
CREATE INDEX idx_agent_runs_session ON public.agent_runs(session_id, created_at DESC);
CREATE INDEX idx_agent_runs_status ON public.agent_runs(status);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own runs select" ON public.agent_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own runs insert" ON public.agent_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own runs update" ON public.agent_runs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own runs delete" ON public.agent_runs FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER agent_runs_touch BEFORE UPDATE ON public.agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================
-- agent_steps: every step in a run
-- =========================================
CREATE TABLE public.agent_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  idx integer NOT NULL,
  kind text NOT NULL, -- thought | tool_call | tool_result | llm | final | error
  tool text,           -- firecrawl_scrape | firecrawl_search | firecrawl_map | firecrawl_crawl | e2b_code | memory_read | memory_write | read_attachment
  title text,
  content text,
  data jsonb,
  credits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_steps_run ON public.agent_steps(run_id, idx);
CREATE INDEX idx_agent_steps_user ON public.agent_steps(user_id, created_at DESC);

ALTER TABLE public.agent_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own steps select" ON public.agent_steps FOR SELECT USING (auth.uid() = user_id);
-- inserts/updates happen via service role from the worker; users do not write directly.

-- =========================================
-- Vector memory (1536 dims = OpenAI/Lovable text-embedding-3-small style)
-- =========================================
CREATE TABLE public.agent_memory_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding vector(1536),
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_memory_session_session ON public.agent_memory_session(session_id);
CREATE INDEX idx_agent_memory_session_embedding
  ON public.agent_memory_session USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.agent_memory_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own session memory select" ON public.agent_memory_session
  FOR SELECT USING (auth.uid() = user_id);

CREATE TABLE public.agent_memory_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  content text NOT NULL,
  embedding vector(1536),
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_memory_user_user ON public.agent_memory_user(user_id);
CREATE INDEX idx_agent_memory_user_embedding
  ON public.agent_memory_user USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.agent_memory_user ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own user memory select" ON public.agent_memory_user
  FOR SELECT USING (auth.uid() = user_id);

-- =========================================
-- Semantic search functions (security definer; user-scoped)
-- =========================================
CREATE OR REPLACE FUNCTION public.match_session_memory(
  _user_id uuid, _session_id uuid, _query vector(1536), _k int DEFAULT 6
) RETURNS TABLE(id uuid, content text, similarity float)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, content, 1 - (embedding <=> _query) AS similarity
  FROM public.agent_memory_session
  WHERE user_id = _user_id AND session_id = _session_id AND embedding IS NOT NULL
  ORDER BY embedding <=> _query ASC
  LIMIT _k;
$$;

CREATE OR REPLACE FUNCTION public.match_user_memory(
  _user_id uuid, _query vector(1536), _k int DEFAULT 6
) RETURNS TABLE(id uuid, content text, similarity float)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, content, 1 - (embedding <=> _query) AS similarity
  FROM public.agent_memory_user
  WHERE user_id = _user_id AND embedding IS NOT NULL
  ORDER BY embedding <=> _query ASC
  LIMIT _k;
$$;

-- =========================================
-- Atomic: record a step + meter credits + bump run total
-- Returns new balance, or -1 if insufficient credits (caller should abort run).
-- =========================================
CREATE OR REPLACE FUNCTION public.record_agent_step(
  _run_id uuid,
  _user_id uuid,
  _idx int,
  _kind text,
  _tool text,
  _title text,
  _content text,
  _data jsonb,
  _credits int
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_balance integer;
  sess_id uuid;
BEGIN
  SELECT session_id INTO sess_id FROM public.agent_runs WHERE id = _run_id AND user_id = _user_id;
  IF sess_id IS NULL THEN RETURN -1; END IF;

  IF _credits > 0 THEN
    new_balance := public.consume_credits(
      _user_id, _credits, 'agent_step:' || _kind || COALESCE(':'||_tool,''),
      sess_id, NULL, _data
    );
    IF new_balance < 0 THEN RETURN -1; END IF;
  ELSE
    SELECT balance INTO new_balance FROM public.user_credits WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.agent_steps(run_id, user_id, idx, kind, tool, title, content, data, credits)
    VALUES (_run_id, _user_id, _idx, _kind, _tool, _title, _content, _data, _credits);

  UPDATE public.agent_runs
    SET credits_spent = credits_spent + GREATEST(_credits, 0),
        updated_at = now()
    WHERE id = _run_id;

  RETURN new_balance;
END;
$$;

-- =========================================
-- Realtime: stream runs + steps to the UI
-- =========================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_steps;
ALTER TABLE public.agent_runs REPLICA IDENTITY FULL;
ALTER TABLE public.agent_steps REPLICA IDENTITY FULL;