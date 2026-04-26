ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS timeline jsonb,
  ADD COLUMN IF NOT EXISTS stop_reason text;