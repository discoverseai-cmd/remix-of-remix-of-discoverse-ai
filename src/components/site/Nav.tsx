import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { Logo } from "./Logo";

const links = [
  { label: "Engine", href: "#engine" },
  { label: "Memory", href: "#memory" },
  { label: "Sandbox", href: "#sandbox" },
  { label: "Workflow", href: "#workflow" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={
        "fixed top-0 inset-x-0 z-50 transition-colors duration-300 " +
        (scrolled
          ? "bg-background/85 backdrop-blur-xl border-b border-border"
          : "bg-background/40 backdrop-blur-sm border-b border-transparent")
      }
    >
      <div className="max-w-7xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <Logo className="size-8" />
            <span className="font-medium tracking-tight text-[17px]">
              Discoverse<span className="text-muted-foreground"> AI</span>
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                className="hover:text-foreground transition-colors"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="hidden md:flex items-center gap-3">
          <a
            href="#docs"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Docs
          </a>
          <a
            href="#deploy"
            className="bg-foreground text-background text-sm font-medium px-4 py-2 rounded-md hover:opacity-90 transition-opacity"
          >
            Deploy Agent
          </a>
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="md:hidden inline-flex items-center justify-center size-10 -mr-2"
          aria-label="Toggle menu"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="px-5 py-4 flex flex-col gap-1">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                onClick={() => setOpen(false)}
                className="py-3 text-base font-medium border-b border-border last:border-0"
              >
                {l.label}
              </a>
            ))}
            <a
              href="#deploy"
              className="mt-3 bg-foreground text-background text-center text-sm font-medium px-4 py-3 rounded-md"
            >
              Deploy Agent
            </a>
          </div>
        </div>
      )}
    </header>
  );
}