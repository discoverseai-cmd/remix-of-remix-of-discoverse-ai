-- Sessions
CREATE TABLE public.chat_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_sessions_user_updated ON public.chat_sessions(user_id, updated_at DESC);
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own sessions select" ON public.chat_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own sessions insert" ON public.chat_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sessions update" ON public.chat_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own sessions delete" ON public.chat_sessions FOR DELETE USING (auth.uid() = user_id);

-- Messages
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','agent','system')),
  content TEXT NOT NULL DEFAULT '',
  attachments JSONB,
  steps JSONB,
  interrupted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_messages_session_created ON public.chat_messages(session_id, created_at);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own messages select" ON public.chat_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own messages insert" ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own messages update" ON public.chat_messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own messages delete" ON public.chat_messages FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_chat_sessions_touch
BEFORE UPDATE ON public.chat_sessions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();