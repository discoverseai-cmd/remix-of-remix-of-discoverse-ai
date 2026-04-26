import { ArrowRight } from "lucide-react";

export function CTA() {
  return (
    <section id="deploy" className="border-t border-border">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-24 md:py-36 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-muted mb-8">
          <span className="size-1.5 rounded-full bg-foreground animate-pulse" />
          <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            Early access · Limited slots
          </span>
        </div>
        <h2 className="text-4xl md:text-7xl font-medium tracking-[-0.04em] leading-[0.95] max-w-4xl mx-auto text-balance">
          Stop prompting.<br />
          <span className="text-muted-foreground">Start delegating.</span>
        </h2>
        <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
          Spin up your first autonomous agent in under five minutes.
        </p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a href="#" className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-foreground text-background font-medium rounded-md hover:opacity-90 transition-opacity">
            Request access
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a href="#" className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3.5 border border-border bg-background font-medium rounded-md hover:bg-muted transition-colors">
            Talk to engineering
          </a>
        </div>
      </div>
    </section>
  );
}