import { Loader2, CheckCircle2, XCircle, MinusCircle, Clock, X, RotateCcw } from "lucide-react";

type Status = "queued" | "running" | "succeeded" | "failed" | "cancelled" | string;

type Props = {
  runId: string | null;
  status: Status | null;
  error: string | null;
  creditsSpent: number;
  stepCount: number;
  onCancel: () => void;
  onRetry: () => void;
  canRetry: boolean;
};

export function RunControlPanel({
  runId,
  status,
  error,
  creditsSpent,
  stepCount,
  onCancel,
  onRetry,
  canRetry,
}: Props) {
  if (!runId || !status) return null;

  const isLive = status === "queued" || status === "running";
  const isFail = status === "failed" || status === "cancelled";
  const isOk = status === "succeeded";

  const Icon = isLive
    ? Loader2
    : isOk
      ? CheckCircle2
      : status === "failed"
        ? XCircle
        : status === "cancelled"
          ? MinusCircle
          : Clock;

  const tone = isFail
    ? "border-destructive/40 bg-destructive/5 text-destructive"
    : isOk
      ? "border-border bg-muted/40 text-foreground"
      : "border-border bg-muted/30 text-foreground";

  return (
    <div
      className={
        "mb-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs " + tone
      }
      role="status"
      aria-live="polite"
    >
      <Icon className={"size-3.5 shrink-0 " + (isLive ? "animate-spin" : "")} />
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em]">
          Agent run · {status}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          {runId.slice(0, 8)} · {stepCount} step{stepCount === 1 ? "" : "s"}
          {creditsSpent > 0 ? ` · ${creditsSpent}c` : ""}
          {error ? ` · ${error}` : ""}
        </p>
      </div>
      {isLive && (
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-background"
          aria-label="Cancel run"
          title="Cancel run"
        >
          <X className="size-3" />
          Cancel
        </button>
      )}
      {isFail && canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground hover:bg-muted"
          aria-label="Retry run"
          title="Retry run"
        >
          <RotateCcw className="size-3" />
          Retry
        </button>
      )}
    </div>
  );
}
