export function Architecture() {
  const rows = [
    { k: "OpenClaw", v: "Reasoning Core", d: "Multi-agent planner with tool use, reflection, and recursive task decomposition." },
    { k: "E2B", v: "Sandbox Runtime", d: "Isolated cloud micro-VMs for code, shell, and browser execution. Spun up in milliseconds." },
    { k: "Weaviate", v: "Vector Memory", d: "Semantic long-term memory with hybrid search, RAG pipelines, and per-agent namespaces." },
    { k: "LLM Gateway", v: "Model Router", d: "Bring-your-own model. Discoverse routes to the cheapest model that satisfies the task." },
  ];
  return (
    <section id="memory" className="border-t border-border bg-foreground text-background">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-20 md:py-28">
        <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
          <div className="lg:col-span-5">
            <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-background/60 mb-4">— Architecture</div>
            <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.03em] leading-[1.05]">
              One stack.<br />Three first-class<br />primitives.
            </h2>
            <p className="mt-6 text-background/70 max-w-md leading-relaxed">
              Reasoning, execution, and memory — composed into a single runtime. No glue code, no orchestration tax.
            </p>
          </div>
          <div className="lg:col-span-7 space-y-px bg-background/15">
            {rows.map((row) => (
              <div key={row.k} className="grid grid-cols-12 gap-4 bg-foreground p-6 md:p-7 items-baseline">
                <div className="col-span-12 md:col-span-3 font-mono text-xs uppercase tracking-[0.2em] text-background/60">{row.k}</div>
                <div className="col-span-12 md:col-span-3 text-xl md:text-2xl font-medium tracking-tight">{row.v}</div>
                <div className="col-span-12 md:col-span-6 text-sm text-background/70 leading-relaxed">{row.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}