import { useEffect, useState } from "react";
import { Activity, Loader2, CheckCircle2, XCircle, MinusCircle, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { AgentRun, AgentStep } from "@/hooks/use-agent-run";

type Props = {
  sessionId: string | null;
  collapsed: boolean;
  activeRunId: string | null;
  onSelectRun: (run: AgentRun, steps: AgentStep[]) => void;
};

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  queued: Clock,
  running: Loader2,
  succeeded: CheckCircle2,
  failed: XCircle,
  cancelled: MinusCircle,
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

export function RunsPanel({ sessionId, collapsed, activeRunId, onSelectRun }: Props) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("agent_runs")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (cancelled) return;
      setRuns((data as AgentRun[] | null) ?? []);
      setLoading(false);
    })();

    const channel = supabase
      .channel(`runs-panel-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_runs",
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as AgentRun;
            setRuns((prev) => [row, ...prev.filter((r) => r.id !== row.id)].slice(0, 20));
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as AgentRun;
            setRuns((prev) => prev.map((r) => (r.id === row.id ? row : r)));
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as AgentRun;
            setRuns((prev) => prev.filter((r) => r.id !== row.id));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  async function openRun(run: AgentRun) {
    const { data } = await supabase
      .from("agent_steps")
      .select("*")
      .eq("run_id", run.id)
      .order("idx", { ascending: true });
    onSelectRun(run, (data as AgentStep[] | null) ?? []);
  }

  if (collapsed) {
    return (
      <div className="px-2 pt-2 pb-1 flex flex-col items-center gap-1.5 border-t border-border">
        <Activity className="size-3.5 text-muted-foreground" aria-label="Runs" />
        {runs.slice(0, 3).map((r) => {
          const Icon = STATUS_ICON[r.status] ?? Clock;
          return (
            <button
              key={r.id}
              onClick={() => openRun(r)}
              className="size-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
              title={`${r.status} · ${fmtTime(r.created_at)}`}
            >
              <Icon className={"size-3.5 " + (r.status === "running" ? "animate-spin" : "")} />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="border-t border-border">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground inline-flex items-center gap-1.5">
          <Activity className="size-3" /> Runs
        </p>
        <span className="text-[11px] font-mono text-muted-foreground">{runs.length}</span>
      </div>
      <div className="max-h-56 overflow-y-auto px-2 pb-2 space-y-0.5">
        {loading && (
          <p className="px-3 py-3 text-center text-[11px] text-muted-foreground">Loading…</p>
        )}
        {!loading && runs.length === 0 && (
          <p className="px-3 py-3 text-center text-[11px] text-muted-foreground">
            No runs yet for this chat.
          </p>
        )}
        {runs.map((r) => {
          const Icon = STATUS_ICON[r.status] ?? Clock;
          const isActive = r.id === activeRunId;
          const preview =
            r.input?.slice(0, 60) || r.final_output?.slice(0, 60) || "(no input)";
          return (
            <button
              key={r.id}
              onClick={() => openRun(r)}
              className={
                "w-full text-left rounded-md px-2.5 py-2 flex items-start gap-2 text-xs transition-colors " +
                (isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")
              }
              title={`${r.status} · ${new Date(r.created_at).toLocaleString()}`}
            >
              <Icon
                className={
                  "size-3.5 shrink-0 mt-0.5 " +
                  (r.status === "running" ? "animate-spin" : "") +
                  (r.status === "failed" ? " text-destructive" : "") +
                  (r.status === "succeeded" ? " text-foreground" : "")
                }
              />
              <span className="flex-1 min-w-0">
                <span className="block truncate">{preview}</span>
                <span className="block text-[10px] font-mono text-muted-foreground/80 mt-0.5">
                  {r.status} · {fmtTime(r.created_at)}
                  {r.credits_spent > 0 ? ` · ${r.credits_spent}c` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
