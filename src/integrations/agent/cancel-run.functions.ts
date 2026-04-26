import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z.object({
  runId: z.string().uuid(),
});

/**
 * Mark an in-flight agent run as cancelled. RLS guarantees the user can only
 * touch their own rows. The worker is fire-and-forget so we can't actually
 * pre-empt it remotely; flipping status to 'cancelled' tells the UI to stop
 * waiting and lets the user retry.
 */
export const cancelAgentRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("agent_runs")
      .update({
        status: "cancelled",
        finished_at: new Date().toISOString(),
        error: "Cancelled by user",
      })
      .eq("id", data.runId)
      .in("status", ["queued", "running"]);
    if (error) {
      console.error("cancelAgentRun: update failed", error);
      throw new Error(error.message);
    }
    return { ok: true };
  });
