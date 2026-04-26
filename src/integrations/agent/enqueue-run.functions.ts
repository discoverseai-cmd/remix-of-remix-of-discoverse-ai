import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  sessionId: z.string().uuid(),
  input: z.string().min(1).max(20000),
  model: z.string().min(1).max(120).optional(),
  messageId: z.string().uuid().optional(),
});

export const enqueueAgentRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workerBase = process.env.WORKER_BASE_URL;
    const workerSecret = process.env.WORKER_SHARED_SECRET;
    if (!workerBase || !workerSecret) {
      throw new Error("Agent worker is not configured");
    }

    // Insert the run row scoped to this user via RLS.
    const { data: run, error: insertErr } = await supabase
      .from("agent_runs")
      .insert({
        user_id: userId,
        session_id: data.sessionId,
        input: data.input,
        model: data.model ?? "google/gemini-2.5-flash",
        message_id: data.messageId ?? null,
        status: "queued",
      })
      .select("id")
      .single();

    if (insertErr || !run) {
      console.error("enqueueAgentRun: insert failed", insertErr);
      throw new Error(insertErr?.message ?? "Failed to create agent run");
    }

    // Fire the worker. It returns 202 immediately and runs in the background.
    const url = workerBase.replace(/\/+$/, "") + "/runs";
    let workerOk = false;
    let workerError: string | null = null;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-worker-secret": workerSecret,
        },
        body: JSON.stringify({ run_id: run.id }),
      });
      workerOk = res.ok;
      if (!res.ok) {
        workerError = `worker ${res.status}: ${await res.text().catch(() => "")}`;
        console.error("enqueueAgentRun: worker rejected", workerError);
      }
    } catch (err) {
      workerError = err instanceof Error ? err.message : String(err);
      console.error("enqueueAgentRun: worker fetch failed", workerError);
    }

    if (!workerOk) {
      // Mark the run failed so the UI doesn't spin forever.
      await supabase
        .from("agent_runs")
        .update({
          status: "failed",
          error: workerError ?? "worker unreachable",
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);
      throw new Error(workerError ?? "Agent worker unreachable");
    }

    return { runId: run.id };
  });
