import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-2.5">
          <Logo className="size-7" />
          <span className="text-sm font-medium tracking-tight">Discoverse AI</span>
        </div>
        <div className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          Autonomous · Sovereign · Auditable
        </div>
        <div className="flex gap-6 text-xs text-muted-foreground">
          <a href="#" className="hover:text-foreground transition-colors">Security</a>
          <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          <a href="#" className="hover:text-foreground transition-colors">Status</a>
        </div>
      </div>
    </footer>
  );
}