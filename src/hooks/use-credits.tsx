import { useCallback, useEffect, useState } from "react";
import { supabase } from "../integrations/supabase/client";
import { useAuth } from "./use-auth";

export type Tier = "park" | "museum";

export type Credits = {
  tier: Tier;
  balance: number;
  daily_limit: number;
  monthly_limit: number;
  last_daily_reset: string;
  last_monthly_reset: string;
};

const PARK_DAILY = 100;
const MUSEUM_MONTHLY = 10000;

/**
 * Estimate credit cost for a single chat round trip BEFORE the response arrives.
 * The actual final cost is computed from real token usage when the stream ends.
 *
 * Tiered scheme:
 *  - Park: greetings ≈ 1, short ≈ 2, medium ≈ 5, long/complex ≈ 10–20.
 *  - Museum: greetings free, short ≈ 5, medium ≈ 25, long/complex ≈ 50–100.
 *  Both are capped to keep usage predictable.
 */
export function estimateCost(tier: Tier, prompt: string): number {
  const len = prompt.trim().length;
  const isGreeting = len > 0 && len <= 30 && /^(hi|hey|hello|yo|sup|good\s|thanks|thx|ok|okay|cool|nice|gm|gn)\b/i.test(prompt.trim());
  if (tier === "museum") {
    if (isGreeting) return 0;
    if (len < 80) return 5;
    if (len < 400) return 25;
    if (len < 1200) return 50;
    return 100;
  }
  // park
  if (isGreeting) return 1;
  if (len < 80) return 2;
  if (len < 400) return 5;
  if (len < 1200) return 10;
  return 20;
}

/**
 * Convert real token usage into final credit cost. We charge based on completion
 * tokens primarily (output is what cost the most for the user).
 */
export function costFromUsage(
  tier: Tier,
  prompt: string,
  usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null,
): number {
  const completion = usage?.completion_tokens ?? 0;
  const promptTok = usage?.prompt_tokens ?? 0;
  const len = prompt.trim().length;
  const isGreeting = len > 0 && len <= 30 && /^(hi|hey|hello|yo|sup|good\s|thanks|thx|ok|okay|cool|nice|gm|gn)\b/i.test(prompt.trim());

  if (tier === "museum") {
    if (isGreeting && completion < 80) return 0;
    // ~1 credit per 20 completion tokens, +1 per 200 prompt tokens, cap 100, min 5.
    const raw = Math.ceil(completion / 20) + Math.ceil(promptTok / 200);
    return Math.max(5, Math.min(100, raw));
  }
  // park: cheaper. ~1 credit per 80 completion tokens, min 1, cap 20.
  if (isGreeting && completion < 60) return 1;
  const raw = Math.ceil(completion / 80) + Math.ceil(promptTok / 800);
  return Math.max(1, Math.min(20, raw));
}

export function useCredits() {
  const { user, isReady } = useAuth();
  const [credits, setCredits] = useState<Credits | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setCredits(null);
      setLoading(false);
      return;
    }
    // Trigger any due reset, then read fresh row.
    await supabase.rpc("reset_credits_if_due", { _user_id: user.id });
    const { data, error } = await supabase
      .from("user_credits")
      .select("tier, balance, daily_limit, monthly_limit, last_daily_reset, last_monthly_reset")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      console.error("[credits] fetch failed", error);
    }
    if (data) {
      setCredits(data as Credits);
    } else {
      // Bootstrap row in case the auth trigger missed (e.g. legacy users).
      const { data: created } = await supabase
        .from("user_credits")
        .insert({ user_id: user.id })
        .select("tier, balance, daily_limit, monthly_limit, last_daily_reset, last_monthly_reset")
        .single();
      if (created) setCredits(created as Credits);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!isReady) return;
    void refresh();
  }, [isReady, refresh]);

  const consume = useCallback(
    async (
      amount: number,
      reason: string,
      meta?: { sessionId?: string; messageId?: string; data?: Record<string, unknown> },
    ): Promise<{ ok: boolean; balance: number }> => {
      if (!user) return { ok: false, balance: 0 };
      const { data, error } = await supabase.rpc("consume_credits", {
        _user_id: user.id,
        _amount: amount,
        _reason: reason,
        _session_id: meta?.sessionId ?? null,
        _message_id: meta?.messageId ?? null,
        _meta: meta?.data ?? null,
      });
      if (error) {
        console.error("[credits] consume failed", error);
        return { ok: false, balance: credits?.balance ?? 0 };
      }
      const newBalance = data as number;
      if (newBalance < 0) {
        return { ok: false, balance: credits?.balance ?? 0 };
      }
      setCredits((c) => (c ? { ...c, balance: newBalance } : c));
      return { ok: true, balance: newBalance };
    },
    [user, credits?.balance],
  );

  const redeemCode = useCallback(
    async (code: string): Promise<{ ok: boolean; error?: string }> => {
      if (!user) return { ok: false, error: "Not signed in" };
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) return { ok: false, error: "Enter a code" };
      const { data, error } = await supabase.rpc("redeem_promo_code", { _code: trimmed });
      if (error) {
        console.error("[credits] redeem failed", error);
        return { ok: false, error: error.message };
      }
      const result = data as { ok: boolean; error?: string; tier?: Tier; balance?: number };
      if (!result?.ok) return { ok: false, error: result?.error ?? "Could not redeem" };
      await refresh();
      return { ok: true };
    },
    [user, refresh],
  );

  return { credits, loading, refresh, consume, redeemCode };
}

export const CREDIT_DEFAULTS = { PARK_DAILY, MUSEUM_MONTHLY };
