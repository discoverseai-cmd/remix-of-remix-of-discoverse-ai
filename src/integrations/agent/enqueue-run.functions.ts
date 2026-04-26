import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const InputSchema = z.object({
  accessToken: z.string().min(1),
  sessionId: z.string().uuid(),
  input: z.string().min(1).max(20000),
  model: z.string().min(1).max(120).optional(),
  messageId: z.string().uuid().optional(),
});

type EnqueueAgentRunResult =
  | { ok: true; runId: string }
  | { ok: false; fallback: true; error: string; runId?: string };

function getSupabaseEnv() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return { error: "Backend environment is not configured" as const };
  }
  return { url, key };
}

function createUserClient(accessToken: string) {
  const env = getSupabaseEnv();
  if ("error" in env) return env;

  return {
    supabase: createClient<Database>(env.url, env.key, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    }),
  };
}

export const enqueueAgentRun = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data }): Promise<EnqueueAgentRunResult> => {
    try {
      const client = createUserClient(data.accessToken);
      if ("error" in client) {
        return { ok: false, fallback: true, error: client.error };
      }

      const { supabase } = client;
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(data.accessToken);

      if (authError || !user) {
        return { ok: false, fallback: true, error: "Please sign in again to start the agent worker" };
      }

      const workerBase = process.env.WORKER_BASE_URL;
      const workerSecret = process.env.WORKER_SHARED_SECRET;
      if (!workerBase || !workerSecret) {
        return { ok: false, fallback: true, error: "Agent worker is not configured" };
      }

      const { data: run, error: insertErr } = await supabase
        .from("agent_runs")
        .insert({
          user_id: user.id,
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
        return {
          ok: false,
          fallback: true,
          error: insertErr?.message ?? "Failed to create agent run",
        };
      }

      const url = workerBase.replace(/\/+$/, "") + "/runs";
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

        if (res.ok) {
          return { ok: true, runId: run.id };
        }

        workerError = `worker ${res.status}: ${await res.text().catch(() => "")}`;
        console.error("enqueueAgentRun: worker rejected", workerError);
      } catch (err) {
        workerError = err instanceof Error ? err.message : String(err);
        console.error("enqueueAgentRun: worker fetch failed", workerError);
      }

      await supabase
        .from("agent_runs")
        .update({
          status: "failed",
          error: workerError ?? "worker unreachable",
          finished_at: new Date().toISOString(),
        })
        .eq("id", run.id);

      return {
        ok: false,
        fallback: true,
        runId: run.id,
        error: workerError ?? "Agent worker unreachable",
      };
    } catch (err) {
      console.error("enqueueAgentRun: unexpected failure", err);
      return {
        ok: false,
        fallback: true,
        error: err instanceof Error ? err.message : "Agent worker failed to start",
      };
    }
  });
