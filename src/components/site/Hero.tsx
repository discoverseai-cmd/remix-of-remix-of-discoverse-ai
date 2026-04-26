import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="relative pt-32 md:pt-40 pb-20 md:pb-28 overflow-hidden">
      {/* subtle radial wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, oklch(0.05 0 0 / 0.06), transparent 60%)",
        }}
      />
      {/* faint grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage:
            "radial-gradient(ellipse 70% 60% at 50% 30%, black, transparent 80%)",
        }}
      />

      <div className="max-w-7xl mx-auto px-5 md:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-muted mb-7">
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-foreground opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full size-1.5 bg-foreground" />
            </span>
            <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              Discoverse Core · v0.1 Preview
            </span>
          </div>

          <h1 className="text-[2.65rem] sm:text-6xl md:text-7xl lg:text-[5.25rem] font-medium tracking-[-0.04em] leading-[0.95] text-balance">
            Autonomous intelligence,
            <br className="hidden sm:block" />
            <span className="text-muted-foreground"> precision calibrated.</span>
          </h1>

          <p className="mt-7 text-base md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
            Discoverse is an OpenClaw-based super agent platform with a built-in
            E2B sandbox and Weaviate vector memory — engineered for true,
            end-to-end automation.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
            <a
              href="#deploy"
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-foreground text-background font-medium rounded-md hover:opacity-90 transition-all"
            >
              Initialize System
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#engine"
              className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3.5 border border-border bg-background font-medium rounded-md hover:bg-muted transition-colors"
            >
              View Framework
            </a>
          </div>
        </div>

        {/* Hero panel */}
        <div className="relative mt-16 md:mt-24 max-w-5xl mx-auto">
          <div
            aria-hidden
            className="absolute -inset-x-10 -inset-y-6 -z-10 opacity-60"
            style={{
              background:
                "radial-gradient(60% 60% at 50% 50%, oklch(0.05 0 0 / 0.10), transparent 70%)",
              filter: "blur(40px)",
            }}
          />
          <div className="rounded-xl border border-border bg-background overflow-hidden shadow-[0_30px_80px_-20px_oklch(0.05_0_0_/_0.18)]">
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border border-b border-border bg-muted/40">
              {[
                { l: "Engine", v: "OpenClaw 0.4" },
                { l: "Memory Latency", v: "24.2 ms" },
                { l: "Active Sandboxes", v: "1,847" },
                { l: "Throughput", v: "48.2k tok/s" },
              ].map((s) => (
                <div key={s.l} className="p-4 flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground">
                    {s.l}
                  </span>
                  <span className="text-sm font-medium tabular-nums">
                    {s.v}
                  </span>
                </div>
              ))}
            </div>

            <div className="grid md:grid-cols-[260px_1fr]">
              <aside className="border-b md:border-b-0 md:border-r border-border p-5 md:p-6 bg-muted/20 space-y-5">
                <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-muted-foreground">
                  Agents
                </div>
                {[
                  { n: "research-orchestrator", s: "running" },
                  { n: "code-executor", s: "idle" },
                  { n: "memory-curator", s: "running" },
                  { n: "browser-operator", s: "queued" },
                ].map((a) => (
                  <div
                    key={a.n}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="font-mono truncate">{a.n}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {a.s}
                    </span>
                  </div>
                ))}
              </aside>

              <div className="p-5 md:p-7 font-mono text-[12px] md:text-[13px] leading-relaxed">
                <div className="flex items-center gap-2 text-muted-foreground mb-4">
                  <div className="flex gap-1.5">
                    <span className="size-2 rounded-full bg-border" />
                    <span className="size-2 rounded-full bg-border" />
                    <span className="size-2 rounded-full bg-border" />
                  </div>
                  <span className="ml-2 text-[10px] uppercase tracking-[0.18em]">
                    discoverse · trace
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div>
                    <span className="text-muted-foreground">→ task</span>{" "}
                    "research recent autonomous agent benchmarks"
                  </div>
                  <div className="text-muted-foreground">
                    [memory] querying weaviate · 12 vectors matched
                  </div>
                  <div className="text-muted-foreground">
                    [plan] generated 4-step execution graph
                  </div>
                  <div>
                    <span className="text-muted-foreground">[sandbox]</span>{" "}
                    e2b session · python3.11 · spawned
                  </div>
                  <div className="text-muted-foreground">
                    [tool] http.fetch arxiv.org/list/cs.AI · ok
                  </div>
                  <div className="text-muted-foreground">
                    [tool] pandas.summarize · 38 results
                  </div>
                  <div>
                    <span className="text-muted-foreground">[memory]</span>{" "}
                    persisted 7 embeddings → long-term
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <span>✓ task complete</span>
                    <span className="text-muted-foreground">· 14.2s</span>
                    <span className="ml-auto inline-block size-2 bg-foreground animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}