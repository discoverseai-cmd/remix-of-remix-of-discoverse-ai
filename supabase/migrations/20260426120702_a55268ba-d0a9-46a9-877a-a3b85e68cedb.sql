ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT 'auto';