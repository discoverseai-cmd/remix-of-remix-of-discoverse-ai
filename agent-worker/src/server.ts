import express from "express";
import { runAgent } from "./agent.js";
import { supabaseAdmin } from "./supabase.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

const SHARED = process.env.WORKER_SHARED_SECRET ?? "";

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.post("/runs", async (req, res) => {
  const secret = req.header("x-worker-secret");
  if (!SHARED || secret !== SHARED) {
    return res.status(401).json({ error: "unauthorized" });
  }
  const runId = req.body?.run_id as string | undefined;
  if (!runId) return res.status(400).json({ error: "run_id required" });

  // Mark running and ack immediately; agent runs in background.
  await supabaseAdmin
    .from("agent_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", runId);

  res.status(202).json({ ok: true });

  runAgent(runId).catch(async (err) => {
    console.error("[agent] fatal", err);
    await supabaseAdmin
      .from("agent_runs")
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        finished_at: new Date().toISOString(),
      })
      .eq("id", runId);
  });
});

const port = Number(process.env.PORT ?? 8080);
app.listen(port, () => console.log(`[worker] listening on :${port}`));
