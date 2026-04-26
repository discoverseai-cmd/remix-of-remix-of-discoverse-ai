import { Brain, Boxes, Workflow as Flow, Globe, Shield, Cpu } from "lucide-react";

const items = [
  {
    icon: Brain,
    tag: "01 / Cognition",
    title: "OpenClaw reasoning core",
    body: "A multi-agent reasoning framework that plans, critiques, and executes complex objectives without human prompting at every step.",
  },
  {
    icon: Boxes,
    tag: "02 / Execution",
    title: "E2B secure sandboxes",
    body: "Every tool call and code interpretation runs inside an ephemeral cloud sandbox — isolated, observable, disposable.",
  },
  {
    icon: Cpu,
    tag: "03 / Memory",
    title: "Weaviate long-term recall",
    body: "Agents persist semantic context across sessions in a vector database, retrieving knowledge from days or months ago.",
  },
  {
    icon: Flow,
    tag: "04 / Orchestration",
    title: "Self-correcting workflows",
    body: "When a step fails, the agent re-plans, re-tools, and retries — iteratively converging on the goal.",
  },
  {
    icon: Globe,
    tag: "05 / Tools",
    title: "Universal tool surface",
    body: "Browsers, shells, APIs, files, databases. Any tool, exposed once, callable by every agent.",
  },
  {
    icon: Shield,
    tag: "06 / Control",
    title: "Auditable by design",
    body: "Every reasoning step, tool call, and memory write is logged and replayable. No black boxes.",
  },
];

export function Capabilities() {
  return (
    <section id="engine" className="border-t border-border">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-20 md:py-28">
        <div className="max-w-2xl mb-14 md:mb-20">
          <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-4">
            — Capabilities
          </div>
          <h2 className="text-3xl md:text-5xl font-medium tracking-[-0.03em] leading-[1.05]">
            Built for agents that
            <br />
            <span className="text-muted-foreground">actually finish work.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border-t border-l border-border">
          {items.map(({ icon: Icon, tag, title, body }) => (
            <div
              key={tag}
              className="group relative p-7 md:p-9 border-r border-b border-border bg-background hover:bg-muted/40 transition-colors"
            >
              <Icon className="size-5 mb-8 text-foreground" strokeWidth={1.5} />
              <div className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-3">
                {tag}
              </div>
              <h3 className="text-lg font-medium tracking-tight mb-2">
                {title}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}