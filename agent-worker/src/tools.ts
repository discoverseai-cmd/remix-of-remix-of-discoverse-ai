import Firecrawl from "@mendable/firecrawl-js";
import { Sandbox } from "@e2b/code-interpreter";
import { supabaseAdmin } from "./supabase.js";
import { embed } from "./lovable-ai.js";

function fc() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Firecrawl is not configured on the worker (FIRECRAWL_API_KEY missing). Cannot scrape/search the web.",
    );
  }
  return new Firecrawl({ apiKey });
}

function requireE2B(): string {
  const k = process.env.E2B_API_KEY;
  if (!k) {
    throw new Error(
      "Code sandbox is not configured on the worker (E2B_API_KEY missing). Cannot execute Python.",
    );
  }
  return k;
}

export const TOOL_COSTS: Record<string, number> = {
  firecrawl_scrape: 2,
  firecrawl_search: 2,
  firecrawl_map: 2,
  firecrawl_crawl: 5,
  e2b_code: 3,
  memory_write: 1,
  memory_read: 0,
  read_attachment: 0,
};

export const TOOL_DEFS = [
  {
    type: "function" as const,
    function: {
      name: "firecrawl_scrape",
      description:
        "Fetch a single URL and return clean markdown of the main content. Use this whenever the user asks to scrape, read, or extract information from a specific page.",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "firecrawl_search",
      description:
        "Live web search. Returns ranked title/URL/snippet results. Use whenever the user asks a factual question, wants current info, or needs to find pages.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" }, limit: { type: "number" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "firecrawl_map",
      description: "List the URLs of a website (sitemap discovery).",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "firecrawl_crawl",
      description: "Recursively crawl a site (limit pages) and return their markdown.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" }, limit: { type: "number" } },
        required: ["url"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "e2b_code",
      description:
        "Execute Python in a real cloud sandbox and return stdout/stderr/result. Use this when the user asks to RUN a script, scrape with code, compute, parse, transform data, generate a file (PDF/CSV/PNG), make a chart, or do anything that needs actual code execution. You can install packages inline with `!pip install <pkg>` at the top of the code. Always RUN the code yourself instead of pasting it back to the user.",
      parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "memory_read",
      description: "Semantic search over the user's long-term memory and this session's memory.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "memory_write",
      description: "Persist a useful fact to memory. Use 'session' for chat-only, 'user' for cross-session.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          scope: { type: "string", enum: ["session", "user"] },
        },
        required: ["content", "scope"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_attachment",
      description: "Read a file the user attached to this session (by name).",
      parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
    },
  },
];

export type ToolCtx = { userId: string; sessionId: string; runId: string };

const TOOL_ALIASES: Record<string, string> = {
  scrape: "firecrawl_scrape",
  search: "firecrawl_search",
  web_search: "firecrawl_search",
  map: "firecrawl_map",
  crawl: "firecrawl_crawl",
  code: "e2b_code",
  python: "e2b_code",
  run_python: "e2b_code",
  run_code: "e2b_code",
  execute_code: "e2b_code",
  sandbox: "e2b_code",
  remember: "memory_write",
  recall: "memory_read",
};

export async function runTool(rawName: string, args: any, ctx: ToolCtx): Promise<string> {
  const name = TOOL_ALIASES[rawName] ?? rawName;
  switch (name) {
    case "firecrawl_scrape": {
      const r: any = await fc().scrape(args.url, { formats: ["markdown"], onlyMainContent: true });
      const md = (r.markdown ?? r.data?.markdown ?? "").toString();
      if (!md) return `(no content extracted from ${args.url})`;
      return md.slice(0, 12000);
    }
    case "firecrawl_search": {
      const r: any = await fc().search(args.query, { limit: args.limit ?? 5 });
      const items = r.web ?? r.data ?? r.results ?? [];
      if (!items.length) return `(no results for "${args.query}")`;
      return JSON.stringify(
        items.slice(0, 10).map((x: any) => ({ title: x.title, url: x.url, description: x.description })),
      );
    }
    case "firecrawl_map": {
      const r: any = await fc().map(args.url, { limit: 200 });
      return JSON.stringify((r.links ?? []).slice(0, 200));
    }
    case "firecrawl_crawl": {
      const r: any = await fc().crawl(args.url, { limit: args.limit ?? 10, scrapeOptions: { formats: ["markdown"] }, pollInterval: 2, timeout: 120 });
      const data = r.data ?? [];
      return JSON.stringify(data.slice(0, 20).map((d: any) => ({ url: d.metadata?.sourceURL, markdown: (d.markdown ?? "").slice(0, 2000) })));
    }
    case "e2b_code": {
      const apiKey = requireE2B();
      const sbx = await Sandbox.create({ apiKey });
      try {
        const exec = await sbx.runCode(args.code);
        return JSON.stringify({
          stdout: exec.logs.stdout.join("\n").slice(0, 6000),
          stderr: exec.logs.stderr.join("\n").slice(0, 2000),
          results: exec.results.map((r) => r.text ?? "").join("\n").slice(0, 4000),
          error: exec.error ? { name: exec.error.name, value: exec.error.value } : null,
        });
      } finally {
        await sbx.kill().catch(() => {});
      }
    }
    case "memory_read": {
      const v = await embed(args.query);
      const [{ data: ses }, { data: usr }] = await Promise.all([
        supabaseAdmin.rpc("match_session_memory", { _user_id: ctx.userId, _session_id: ctx.sessionId, _query: v as any, _k: 6 }),
        supabaseAdmin.rpc("match_user_memory", { _user_id: ctx.userId, _query: v as any, _k: 6 }),
      ]);
      return JSON.stringify({ session: ses ?? [], user: usr ?? [] });
    }
    case "memory_write": {
      const v = await embed(args.content);
      const table = args.scope === "user" ? "agent_memory_user" : "agent_memory_session";
      const row: any = args.scope === "user"
        ? { user_id: ctx.userId, content: args.content, embedding: v }
        : { user_id: ctx.userId, session_id: ctx.sessionId, content: args.content, embedding: v };
      const { error } = await supabaseAdmin.from(table).insert(row);
      if (error) throw new Error(error.message);
      return "ok";
    }
    case "read_attachment": {
      // Lists matching attachments stored in the chat-attachments bucket under <userId>/<sessionId>/.
      const prefix = `${ctx.userId}/${ctx.sessionId}`;
      const { data: list } = await supabaseAdmin.storage.from("chat-attachments").list(prefix);
      const match = list?.find((f) => f.name === args.name) ?? list?.[0];
      if (!match) return "no attachment found";
      const { data: file } = await supabaseAdmin.storage.from("chat-attachments").download(`${prefix}/${match.name}`);
      if (!file) return "could not download";
      const text = await file.text().catch(() => "");
      return text.slice(0, 12000) || `(binary file ${match.name})`;
    }
  }
  throw new Error(`unknown tool: ${name}`);
}
