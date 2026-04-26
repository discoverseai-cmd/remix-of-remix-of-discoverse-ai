
-- Audit log table for chat session writes
CREATE TABLE public.chat_session_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  user_id uuid NOT NULL,
  actor_id uuid,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_session_audit_user ON public.chat_session_audit(user_id, created_at DESC);
CREATE INDEX idx_chat_session_audit_session ON public.chat_session_audit(session_id, created_at DESC);

ALTER TABLE public.chat_session_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own audit select"
  ON public.chat_session_audit FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = actor_id);

-- Trigger function
CREATE OR REPLACE FUNCTION public.log_chat_session_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.chat_session_audit(session_id, user_id, actor_id, operation, new_data)
    VALUES (NEW.id, NEW.user_id, auth.uid(), 'INSERT',
            jsonb_build_object('title', NEW.title, 'updated_at', NEW.updated_at));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.chat_session_audit(session_id, user_id, actor_id, operation, old_data, new_data)
    VALUES (NEW.id, NEW.user_id, auth.uid(), 'UPDATE',
            jsonb_build_object('title', OLD.title, 'updated_at', OLD.updated_at),
            jsonb_build_object('title', NEW.title, 'updated_at', NEW.updated_at));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.chat_session_audit(session_id, user_id, actor_id, operation, old_data)
    VALUES (OLD.id, OLD.user_id, auth.uid(), 'DELETE',
            jsonb_build_object('title', OLD.title, 'updated_at', OLD.updated_at));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER chat_sessions_audit_ins
  AFTER INSERT ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.log_chat_session_audit();

CREATE TRIGGER chat_sessions_audit_upd
  AFTER UPDATE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.log_chat_session_audit();

CREATE TRIGGER chat_sessions_audit_del
  AFTER DELETE ON public.chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.log_chat_session_audit();
