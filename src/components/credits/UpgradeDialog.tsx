import { useState } from "react";
import { Sparkles, X, KeyRound, Loader2, Check, AlertCircle } from "lucide-react";
import type { Credits } from "../hooks/use-credits";

export function CreditsBadge({
  credits,
  onUpgrade,
}: {
  credits: Credits | null;
  onUpgrade: () => void;
}) {
  if (!credits) return null;
  const isMuseum = credits.tier === "museum";
  const cap = isMuseum ? credits.monthly_limit : credits.daily_limit;
  const pct = cap > 0 ? Math.max(0, Math.min(100, (credits.balance / cap) * 100)) : 0;
  return (
    <button
      type="button"
      onClick={onUpgrade}
      className={
        "group inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-mono uppercase tracking-[0.14em] transition-colors " +
        (isMuseum
          ? "border-foreground/40 bg-foreground/5 text-foreground hover:bg-foreground/10"
          : "border-border text-muted-foreground hover:bg-muted")
      }
      title={
        isMuseum
          ? `Museum tier · ${credits.balance.toLocaleString()} / ${cap.toLocaleString()} this month`
          : `Park tier · ${credits.balance} / ${cap} today · click to upgrade`
      }
    >
      <Sparkles className="size-3" />
      <span>{credits.balance.toLocaleString()}</span>
      <span className="opacity-60">/{cap.toLocaleString()}</span>
      <span
        aria-hidden
        className="hidden sm:block w-10 h-1 rounded-full bg-muted overflow-hidden"
      >
        <span
          className={
            "block h-full " + (pct < 15 ? "bg-red-500" : isMuseum ? "bg-foreground" : "bg-emerald-500")
          }
          style={{ width: `${pct}%` }}
        />
      </span>
    </button>
  );
}

export function UpgradeDialog({
  open,
  onClose,
  credits,
  onRedeem,
}: {
  open: boolean;
  onClose: () => void;
  credits: Credits | null;
  onRedeem: (code: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  if (!open) return null;
  const isMuseum = credits?.tier === "museum";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await onRedeem(code);
    setSubmitting(false);
    if (res.ok) {
      setSuccess(true);
      setCode("");
      window.setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1400);
    } else {
      setError(res.error ?? "Could not redeem code");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] bg-foreground/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4" />
            <h2 className="text-sm font-semibold tracking-tight">
              {isMuseum ? "Discoverse Museum — active" : "Upgrade to Discoverse Museum"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="size-8 inline-flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {isMuseum ? (
            <div className="space-y-2 text-sm">
              <p className="text-foreground">
                You're on Museum tier. Enjoy higher-quality reasoning, longer context,
                and the best output Discoverse can produce.
              </p>
              <p className="text-muted-foreground text-[13px]">
                10,000 credits/month · greetings cost nothing · resets on your signup
                anniversary day each month.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-lg border border-border p-3">
                  <div className="font-mono uppercase tracking-[0.14em] text-muted-foreground text-[10px] mb-1">
                    Park · current
                  </div>
                  <div className="font-semibold">100 / day</div>
                  <div className="text-muted-foreground mt-1">Fast & free.</div>
                </div>
                <div className="rounded-lg border border-foreground/40 bg-foreground/5 p-3">
                  <div className="font-mono uppercase tracking-[0.14em] text-foreground text-[10px] mb-1">
                    Museum · upgrade
                  </div>
                  <div className="font-semibold">10,000 / month</div>
                  <div className="text-muted-foreground mt-1">Best output.</div>
                </div>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Enter an invite code to unlock Museum. Greetings stay free, complex
                tasks burn credits faster but produce perfect output.
              </p>
            </div>
          )}

          {!isMuseum && (
            <form onSubmit={submit} className="space-y-2">
              <label className="block text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                Invite / promo code
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <input
                    autoFocus
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value);
                      setError(null);
                    }}
                    placeholder="MUSEUM2026"
                    className="w-full pl-8 pr-3 py-2 text-sm bg-muted/50 border border-border rounded-md outline-none focus:border-foreground/40 focus:bg-background uppercase tracking-wider"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || !code.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : success ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {success ? "Unlocked!" : "Redeem"}
                </button>
              </div>
              {error && (
                <p className="text-[12px] text-red-500 flex items-center gap-1.5">
                  <AlertCircle className="size-3" />
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
