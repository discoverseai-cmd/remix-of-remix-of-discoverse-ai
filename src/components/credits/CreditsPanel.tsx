import { useEffect, useState } from "react";
import { Sparkles, Loader2, Lock, KeyRound, AlertCircle, Check, Clock, TrendingDown } from "lucide-react";
import { useCredits } from "../../hooks/use-credits";
import { supabase } from "../../integrations/supabase/client";
import { useAuth } from "../../hooks/use-auth";

type LedgerRow = {
  id: string;
  delta: number;
  reason: string;
  created_at: string;
  meta: Record<string, unknown> | null;
};

/**
 * Credits & usage panel for the Settings page.
 *
 * Surfaces tier, balance, reset window, redemption flow, and recent ledger
 * activity so users can verify exactly what each chat round trip costs.
 */
export function CreditsPanel() {
  const { credits, loading, redeemCode, refresh } = useCredits();
  const { user } = useAuth();
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const [code, setCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemed, setRedeemed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) return;
      setLedgerLoading(true);
      const { data, error } = await supabase
        .from("credit_ledger")
        .select("id, delta, reason, created_at, meta")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(15);
      if (!cancelled) {
        if (error) console.error("[credits panel] ledger fetch failed", error);
        setLedger((data as LedgerRow[]) ?? []);
        setLedgerLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, credits?.balance]);

  if (loading || !credits) {
    return (
      <div className="border border-border rounded-2xl p-6 flex items-center justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  const isMuseum = credits.tier === "museum";
  const cap = isMuseum ? credits.monthly_limit : credits.daily_limit;
  const pct = cap > 0 ? Math.max(0, Math.min(100, (credits.balance / cap) * 100)) : 0;
  const lowFuel = pct < 15;

  // Compute next reset hint (purely cosmetic).
  const resetHint = isMuseum
    ? "Resets monthly on your signup anniversary day."
    : "Resets every day at midnight UTC.";

  async function onRedeem(e: React.FormEvent) {
    e.preventDefault();
    setRedeeming(true);
    setRedeemError(null);
    const res = await redeemCode(code);
    setRedeeming(false);
    if (res.ok) {
      setRedeemed(true);
      setCode("");
      await refresh();
      window.setTimeout(() => setRedeemed(false), 2200);
    } else {
      setRedeemError(res.error ?? "Could not redeem code");
    }
  }

  return (
    <div className="space-y-4">
      {/* Tier + balance card */}
      <div className="border border-border rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4" />
              <h3 className="text-sm font-semibold tracking-tight">
                Discoverse {isMuseum ? "Museum" : "Park"}
              </h3>
              <span
                className={
                  "text-[10px] font-mono uppercase tracking-[0.14em] px-1.5 py-0.5 rounded " +
                  (isMuseum
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground")
                }
              >
                {isMuseum ? "Premium" : "Free"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isMuseum
                ? "Best output, longer context, greetings free."
                : "Fast & free defaults. Upgrade for premium output."}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">
              {credits.balance.toLocaleString()}
            </div>
            <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
              credits left
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={
              "h-full transition-all " +
              (lowFuel ? "bg-red-500" : isMuseum ? "bg-foreground" : "bg-emerald-500")
            }
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3" />
            {resetHint}
          </span>
          {lowFuel && (
            <span className="inline-flex items-center gap-1 text-red-500 font-medium">
              <AlertCircle className="size-3" />
              Low credits
            </span>
          )}
        </div>
      </div>

      {/* How costs work — token-based, no fixed-rate tables */}
      <div className="border border-border rounded-2xl p-4 sm:p-5">
        <h3 className="text-sm font-semibold tracking-tight mb-2">How credits are charged</h3>
        <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
          <li>
            Before sending, we show an <span className="text-foreground/80">estimated</span> cost
            based on the size of your prompt.
          </li>
          <li>
            When the response finishes, the final charge is computed from the{" "}
            <span className="text-foreground/80">real token usage</span> reported by the model
            — never a fixed per-message price.
          </li>
          <li>
            Short outputs cost less, long or complex outputs cost more. Greetings stay free
            on Museum.
          </li>
          <li>
            If your estimate exceeds your balance, sending is blocked until you redeem more
            credits or wait for your next reset.
          </li>
        </ul>
      </div>

      {/* Redeem code */}
      {!isMuseum && (
        <div className="border border-foreground/30 bg-foreground/5 rounded-2xl p-4 sm:p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold tracking-tight inline-flex items-center gap-1.5">
              <Lock className="size-3.5" />
              Unlock Discoverse Museum
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Premium output, longer context, greetings free. Charged from real token
              usage — never a fixed per-message rate.
            </p>
          </div>
          <form onSubmit={onRedeem} className="flex gap-2">
            <div className="relative flex-1">
              <KeyRound className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setRedeemError(null);
                }}
                placeholder="Enter invite / promo code"
                className="w-full pl-8 pr-3 py-2 text-sm bg-background border border-border rounded-md outline-none focus:border-foreground/40 uppercase tracking-wider"
              />
            </div>
            <button
              type="submit"
              disabled={redeeming || !code.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {redeeming ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : redeemed ? (
                <Check className="size-3.5" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {redeemed ? "Unlocked" : "Redeem"}
            </button>
          </form>
          {redeemError && (
            <p className="text-[12px] text-red-500 flex items-center gap-1.5">
              <AlertCircle className="size-3" />
              {redeemError}
            </p>
          )}
        </div>
      )}

      {/* Recent activity */}
      <div className="border border-border rounded-2xl overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight inline-flex items-center gap-1.5">
            <TrendingDown className="size-3.5" />
            Recent activity
          </h3>
          <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
            Last 15
          </span>
        </div>
        {ledgerLoading ? (
          <div className="p-6 flex items-center justify-center text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : ledger.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No credit activity yet. Send your first message to see costs here.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {ledger.map((row) => {
              const isCharge = row.delta < 0;
              const meta = (row.meta ?? {}) as Record<string, unknown>;
              const tier = typeof meta.tier === "string" ? (meta.tier as string) : null;
              const completion =
                typeof meta.completion_tokens === "number"
                  ? (meta.completion_tokens as number)
                  : null;
              return (
                <li key={row.id} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium truncate">
                      {prettyReason(row.reason)}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {new Date(row.created_at).toLocaleString()}
                      {tier && ` · ${tier}`}
                      {completion !== null && ` · ${completion} tokens`}
                    </div>
                  </div>
                  <div
                    className={
                      "font-mono text-sm tabular-nums shrink-0 " +
                      (isCharge ? "text-foreground" : "text-emerald-500")
                    }
                  >
                    {isCharge ? "" : "+"}
                    {row.delta}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function prettyReason(reason: string): string {
  switch (reason) {
    case "chat_message":
      return "Chat message";
    case "promo_redeem":
      return "Promo code redeemed";
    case "daily_reset":
      return "Daily reset";
    case "monthly_reset":
      return "Monthly reset";
    case "signup_bonus":
      return "Sign-up bonus";
    default:
      return reason.replace(/_/g, " ");
  }
}
