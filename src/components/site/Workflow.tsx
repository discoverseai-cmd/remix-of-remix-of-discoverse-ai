const steps = [
  { n: "01", t: "Define an objective", d: "Describe the outcome — not the steps. Discoverse decomposes it into an executable graph." },
  { n: "02", t: "Agents recall and plan", d: "OpenClaw queries Weaviate for prior context, then drafts a plan with the right tools and models." },
  { n: "03", t: "Sandbox executes", d: "Each step runs inside an isolated E2B environment — code, browsers, APIs, shells." },
  { n: "04", t: "Reflect, persist, repeat", d: "Outcomes are critiqued, embedded into long-term memory, and the next task starts smarter." },
];

export function Workflow() {
  return (
    <section id="workflow" className="border-t border-border">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-20 md:py-28">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-4">— Workflow</div>
            <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.03em] leading-[1.05] max-w-2xl">
              From intent to outcome,<br />
              <span className="text-muted-foreground">without a human in the loop.</span>
            </h2>
          </div>
          <a href="#docs" className="text-sm font-medium text-foreground border-b border-foreground pb-0.5 self-start md:self-end">
            Read the technical brief →
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border">
          {steps.map((s) => (
            <div key={s.n} className="bg-background p-7 md:p-8 flex flex-col">
              <div className="font-mono text-xs text-muted-foreground tracking-[0.2em]">STEP {s.n}</div>
              <div className="mt-8 text-7xl font-medium tracking-tighter tabular-nums leading-none">{s.n}</div>
              <h3 className="mt-8 text-lg font-medium tracking-tight">{s.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}