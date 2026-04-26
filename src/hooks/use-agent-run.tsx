import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AgentStep = Database["public"]["Tables"]["agent_steps"]["Row"];
export type AgentRun = Database["public"]["Tables"]["agent_runs"]["Row"];

export type AgentRunState = {
  run: AgentRun | null;
  steps: AgentStep[];
  status: AgentRun["status"] | "loading";
  error: string | null;
};

/**
 * Subscribe to a single agent_runs row + its agent_steps stream via realtime.
 * Returns the latest known run + ordered steps. Cleans up its channel on unmount
 * or when runId changes.
 */
export function useAgentRun(runId: string | null): AgentRunState {
  const [run, setRun] = useState<AgentRun | null>(null);
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AgentRun["status"] | "loading">("loading");

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setSteps([]);
      setStatus("loading");
      setError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      const [{ data: runRow, error: runErr }, { data: stepRows, error: stepsErr }] =
        await Promise.all([
          supabase.from("agent_runs").select("*").eq("id", runId).maybeSingle(),
          supabase
            .from("agent_steps")
            .select("*")
            .eq("run_id", runId)
            .order("idx", { ascending: true }),
        ]);
      if (cancelled) return;
      if (runErr) setError(runErr.message);
      if (stepsErr) setError((prev) => prev ?? stepsErr.message);
      if (runRow) {
        setRun(runRow);
        setStatus(runRow.status);
      }
      if (stepRows) setSteps(stepRows);
    })();

    const channel = supabase
      .channel(`agent-run-${runId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agent_runs", filter: `id=eq.${runId}` },
        (payload) => {
          const next = payload.new as AgentRun | null;
          if (next) {
            setRun(next);
            setStatus(next.status);
            if (next.error) setError(next.error);
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_steps", filter: `run_id=eq.${runId}` },
        (payload) => {
          const step = payload.new as AgentStep;
          setSteps((prev) => {
            if (prev.some((s) => s.id === step.id)) return prev;
            const next = [...prev, step];
            next.sort((a, b) => a.idx - b.idx);
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [runId]);

  return { run, steps, status, error };
}
