import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import { supabaseAdmin } from "./supabase.js";
import { chat, type ChatMessage } from "./lovable-ai.js";
import { TOOL_COSTS, TOOL_DEFS, runTool, type ToolCtx } from "./tools.js";

const SYSTEM = `You are Discoverse, an autonomous research + execution agent.

OPERATING RULES — follow strictly:
1. NEVER hand the user raw code and tell them to run it. If a task involves
   running a script, scraping, fetching, parsing, computing, generating a file
   (PDF / CSV / slides / image), CALL THE APPROPRIATE TOOL and return the
   real result.
   - "scrape <site>", "get top stories", "fetch X" → firecrawl_scrape /
     firecrawl_search / firecrawl_map / firecrawl_crawl.
   - "run python", "compute", "parse this", "make a chart", "generate a pdf",
     "scrape with python" → e2b_code (a real Python sandbox; install packages
     with !pip install ... inside the snippet if needed).
   - "remember", "save preference", durable facts → memory_write.
   - "what did I tell you", "recall" → memory_read.
2. NEVER fabricate URLs, titles, numbers, prices, or quotes. If a tool fails,
   say so plainly and either retry with a different tool or stop. Do not
   pretend the call succeeded.
3. Think briefly (1–2 sentences) BEFORE each tool call so the user sees your
   plan in the timeline. Keep thoughts short.
4. The final assistant turn must contain NO tool call. Write a clean, useful
   markdown answer for the user: short summary, then results / links / table.
   Do NOT paste the raw script you ran unless the user explicitly asked for
   the source code — show the OUTPUT.
5. If a required tool returns "not configured" or an auth error, tell the user
   exactly which capability is unavailable and stop — do not invent data.`;

type StepKind = "thought" | "tool_call" | "tool_result" | "llm" | "final" | "error";

const State = Annotation.Root({
  messages: Annotation<ChatMessage[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  idx: Annotation<number>({ reducer: (_a, b) => b, default: () => 0 }),
  done: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  finalText: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  ctx: Annotation<ToolCtx>({ reducer: (_a, b) => b, default: () => ({ userId: "", sessionId: "", runId: "" }) }),
  model: Annotation<string>({ reducer: (_a, b) => b, default: () => "google/gemini-2.5-flash" }),
});

async function recordStep(
  ctx: ToolCtx,
  idx: number,
  kind: StepKind,
  tool: string | null,
  title: string | null,
  content: string | null,
  data: any,
  credits: number,
): Promise<number> {
  const { data: balance, error } = await supabaseAdmin.rpc("record_agent_step", {
    _run_id: ctx.runId,
    _user_id: ctx.userId,
    _idx: idx,
    _kind: kind,
    _tool: tool,
    _title: title,
    _content: content,
    _data: data,
    _credits: credits,
  });
  if (error) throw new Error(error.message);
  return balance as number;
}

export async function runAgent(runId: string): Promise<void> {
  const { data: run, error } = await supabaseAdmin
    .from("agent_runs")
    .select("id, user_id, session_id, input, model")
    .eq("id", runId)
    .single();
  if (error || !run) throw new Error(`run not found: ${runId}`);

  const ctx: ToolCtx = { userId: run.user_id, sessionId: run.session_id, runId: run.id };

  const graph = new StateGraph(State)
    .addNode("llm", async (s) => {
      const { message, usage } = await chat({
        model: s.model,
        messages: [{ role: "system", content: SYSTEM }, ...s.messages],
        tools: TOOL_DEFS,
      });
      const tokens = usage?.total_tokens ?? 0;
      const cost = Math.max(1, Math.ceil(tokens / 1000));
      const balance = await recordStep(s.ctx, s.idx, "llm", null, "model thinking",
        message?.content ?? null, { usage }, cost);
      if (balance < 0) {
        await supabaseAdmin.from("agent_runs").update({ status: "aborted_no_credits", finished_at: new Date().toISOString() }).eq("id", s.ctx.runId);
        return { done: true, finalText: "(aborted: no credits)", idx: s.idx + 1 };
      }
      const newMessages: ChatMessage[] = [message];
      const calls = message?.tool_calls ?? [];
      if (!calls.length) {
        return { messages: newMessages, idx: s.idx + 1, done: true, finalText: message?.content ?? "" };
      }
      return { messages: newMessages, idx: s.idx + 1 };
    })
    .addNode("tools", async (s) => {
      const last = s.messages[s.messages.length - 1] as any;
      const calls = last?.tool_calls ?? [];
      let idx = s.idx;
      const outMsgs: ChatMessage[] = [];
      for (const call of calls) {
        const name = call.function?.name;
        let args: any = {};
        try { args = JSON.parse(call.function?.arguments ?? "{}"); } catch {}
        const cost = TOOL_COSTS[name] ?? 1;
        let result = "";
        let kind: StepKind = "tool_result";
        try {
          await recordStep(s.ctx, idx++, "tool_call", name, name, JSON.stringify(args).slice(0, 800), { args }, 0);
          result = await runTool(name, args, s.ctx);
          const balance = await recordStep(s.ctx, idx++, "tool_result", name, `${name} ✓`, result.slice(0, 800), null, cost);
          if (balance < 0) {
            await supabaseAdmin.from("agent_runs").update({ status: "aborted_no_credits", finished_at: new Date().toISOString() }).eq("id", s.ctx.runId);
            return { done: true, finalText: "(aborted: no credits)", idx };
          }
        } catch (e) {
          kind = "error";
          result = `error: ${e instanceof Error ? e.message : String(e)}`;
          await recordStep(s.ctx, idx++, "error", name, `${name} ✗`, result, null, 0);
        }
        outMsgs.push({ role: "tool", tool_call_id: call.id, name, content: result });
      }
      return { messages: outMsgs, idx };
    })
    .addEdge(START, "llm")
    .addConditionalEdges("llm", (s) => (s.done ? END : "tools"))
    .addEdge("tools", "llm");

  const compiled = graph.compile();
  const final = await compiled.invoke(
    {
      messages: [{ role: "user", content: run.input }],
      ctx,
      model: run.model,
    },
    { recursionLimit: 24 },
  );

  const finalText = final.finalText || "(no output)";
  await recordStep(ctx, final.idx ?? 0, "final", null, "final", finalText, null, 0);
  await supabaseAdmin
    .from("agent_runs")
    .update({ status: "completed", final_output: finalText, finished_at: new Date().toISOString() })
    .eq("id", runId);
}
