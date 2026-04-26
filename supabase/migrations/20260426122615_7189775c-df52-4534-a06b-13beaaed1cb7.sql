
-- ============ user_credits ============
CREATE TABLE public.user_credits (
  user_id uuid PRIMARY KEY,
  tier text NOT NULL DEFAULT 'park' CHECK (tier IN ('park','museum')),
  balance integer NOT NULL DEFAULT 100,
  daily_limit integer NOT NULL DEFAULT 100,
  monthly_limit integer NOT NULL DEFAULT 0,
  last_daily_reset timestamptz NOT NULL DEFAULT now(),
  last_monthly_reset timestamptz NOT NULL DEFAULT now(),
  signup_anniversary_day smallint NOT NULL DEFAULT EXTRACT(DAY FROM now())::smallint,
  upgraded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own credits select" ON public.user_credits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own credits insert" ON public.user_credits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own credits update" ON public.user_credits FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_credits_touch
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create credits row for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, tier, balance, daily_limit, monthly_limit, signup_anniversary_day)
  VALUES (NEW.id, 'park', 100, 100, 0, EXTRACT(DAY FROM now())::smallint)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_credits ON auth.users;
CREATE TRIGGER on_auth_user_created_credits
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_credits();

-- ============ promo_codes ============
CREATE TABLE public.promo_codes (
  code text PRIMARY KEY,
  tier text NOT NULL DEFAULT 'museum' CHECK (tier IN ('park','museum')),
  max_redemptions integer,
  redemption_count integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo codes read for authed" ON public.promo_codes FOR SELECT
  TO authenticated USING (active = true);

INSERT INTO public.promo_codes (code, tier, max_redemptions) VALUES
  ('MUSEUM2026', 'museum', NULL),
  ('DISCOVERSE', 'museum', NULL);

-- ============ credit_ledger ============
CREATE TABLE public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  session_id uuid,
  message_id uuid,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own ledger select" ON public.credit_ledger FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_credit_ledger_user_created ON public.credit_ledger(user_id, created_at DESC);

-- ============ Functions ============

-- Reset credits if due (daily for park, monthly anniversary for museum)
CREATE OR REPLACE FUNCTION public.reset_credits_if_due(_user_id uuid)
RETURNS public.user_credits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.user_credits;
  today_utc date := (now() AT TIME ZONE 'UTC')::date;
  last_daily_date date;
  months_since int;
BEGIN
  SELECT * INTO rec FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id) VALUES (_user_id) RETURNING * INTO rec;
  END IF;

  IF rec.tier = 'park' THEN
    last_daily_date := (rec.last_daily_reset AT TIME ZONE 'UTC')::date;
    IF last_daily_date < today_utc THEN
      UPDATE public.user_credits
        SET balance = rec.daily_limit,
            last_daily_reset = now()
        WHERE user_id = _user_id
        RETURNING * INTO rec;
      INSERT INTO public.credit_ledger(user_id, delta, reason, meta)
        VALUES (_user_id, rec.daily_limit, 'daily_reset', jsonb_build_object('tier','park'));
    END IF;
  ELSE
    -- museum: reset monthly when anniversary day passes
    months_since := (EXTRACT(YEAR FROM now())::int - EXTRACT(YEAR FROM rec.last_monthly_reset)::int) * 12
                    + (EXTRACT(MONTH FROM now())::int - EXTRACT(MONTH FROM rec.last_monthly_reset)::int);
    IF months_since >= 1 AND EXTRACT(DAY FROM now())::int >= rec.signup_anniversary_day THEN
      UPDATE public.user_credits
        SET balance = rec.monthly_limit,
            last_monthly_reset = now()
        WHERE user_id = _user_id
        RETURNING * INTO rec;
      INSERT INTO public.credit_ledger(user_id, delta, reason, meta)
        VALUES (_user_id, rec.monthly_limit, 'monthly_reset', jsonb_build_object('tier','museum'));
    END IF;
  END IF;

  RETURN rec;
END;
$$;

-- Consume credits atomically. Returns remaining balance, or -1 if insufficient.
CREATE OR REPLACE FUNCTION public.consume_credits(
  _user_id uuid,
  _amount integer,
  _reason text,
  _session_id uuid DEFAULT NULL,
  _message_id uuid DEFAULT NULL,
  _meta jsonb DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance integer;
BEGIN
  PERFORM public.reset_credits_if_due(_user_id);
  SELECT balance INTO current_balance FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;
  IF current_balance IS NULL THEN RETURN -1; END IF;
  IF _amount <= 0 THEN
    INSERT INTO public.credit_ledger(user_id, delta, reason, session_id, message_id, meta)
      VALUES (_user_id, 0, _reason, _session_id, _message_id, _meta);
    RETURN current_balance;
  END IF;
  IF current_balance < _amount THEN RETURN -1; END IF;
  UPDATE public.user_credits SET balance = balance - _amount WHERE user_id = _user_id
    RETURNING balance INTO current_balance;
  INSERT INTO public.credit_ledger(user_id, delta, reason, session_id, message_id, meta)
    VALUES (_user_id, -_amount, _reason, _session_id, _message_id, _meta);
  RETURN current_balance;
END;
$$;

-- Redeem promo code -> upgrade to museum tier
CREATE OR REPLACE FUNCTION public.redeem_promo_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  promo public.promo_codes;
  result public.user_credits;
BEGIN
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not authenticated'); END IF;

  SELECT * INTO promo FROM public.promo_codes WHERE code = upper(_code) AND active = true FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'Invalid or inactive code'); END IF;
  IF promo.max_redemptions IS NOT NULL AND promo.redemption_count >= promo.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Code has reached its redemption limit');
  END IF;

  UPDATE public.user_credits
    SET tier = promo.tier,
        monthly_limit = CASE WHEN promo.tier = 'museum' THEN 10000 ELSE monthly_limit END,
        balance = CASE WHEN promo.tier = 'museum' THEN 10000 ELSE balance END,
        last_monthly_reset = now(),
        upgraded_at = now()
    WHERE user_id = uid
    RETURNING * INTO result;

  IF NOT FOUND THEN
    INSERT INTO public.user_credits (user_id, tier, balance, daily_limit, monthly_limit, last_monthly_reset, upgraded_at)
      VALUES (uid, promo.tier, 10000, 100, 10000, now(), now())
      RETURNING * INTO result;
  END IF;

  UPDATE public.promo_codes SET redemption_count = redemption_count + 1 WHERE code = promo.code;

  INSERT INTO public.credit_ledger(user_id, delta, reason, meta)
    VALUES (uid, 10000, 'promo_redeemed', jsonb_build_object('code', promo.code, 'tier', promo.tier));

  RETURN jsonb_build_object('ok', true, 'tier', result.tier, 'balance', result.balance);
END;
$$;

-- Backfill credits for any existing users
INSERT INTO public.user_credits (user_id)
  SELECT id FROM auth.users
  ON CONFLICT (user_id) DO NOTHING;
