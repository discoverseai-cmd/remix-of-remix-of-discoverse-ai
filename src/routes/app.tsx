import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUp, Sparkles, Cpu, Database, Box } from "lucide-react";
import { Logo } from "../components/site/Logo";

export const Route = createFileRoute("/app")({
  component: AgentApp,
  head: () => ({
    meta: [
      { title: "Discoverse Agent — Try the Agent" },
      {
        name: "description",
        content:
          "Interact with a live Discoverse autonomous agent. OpenClaw reasoning, E2B sandbox, Weaviate memory.",
      },
    ],
  }),
});

type Role = "user" | "agent";
type Step = { kind: "reason" | "tool" | "memory"; label: string };
type Message = {
  id: string;
  role: Role;
  content: string;
  steps?: Step[];
};

const SUGGESTIONS = [
  "Research the latest in autonomous agents and summarize",
  "Write & run a Python script that scrapes Hacker News",
  "Recall what we discussed about vector memory",
  "Plan a 3-step automation for daily reports",
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function simulateAgent(prompt: string): { steps: Step[]; reply: string } {
  const steps: Step[] = [
    { kind: "reason", label: "OpenClaw · planning task graph" },
    { kind: "memory", label: "Weaviate · retrieving long-term context" },
    { kind: "tool", label: "E2B · executing sandboxed step" },
    { kind: "reason", label: "OpenClaw · synthesizing result" },
  ];
  const reply = `I planned a 4-step trace for: "${prompt}".\n\nThe sandbox executed cleanly and I stored the new context as an episodic memory. Ask a follow-up to refine, or push this trace to a recurring workflow.`;
  return { steps, reply };
}

function AgentApp() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uid(),
      role: "agent",
      content:
        "I'm Discoverse — an autonomous agent. Tell me an objective and I'll plan, execute in a sandbox, and remember it.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeSteps, setActiveSteps] = useState<Step[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, activeSteps]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const userMsg: Message = { id: uid(), role: "user", content: trimmed };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);

    const { steps, reply } = simulateAgent(trimmed);
    setActiveSteps([]);
    for (let i = 0; i < steps.length; i++) {
      await new Promise((r) => setTimeout(r, 550));
      setActiveSteps((prev) => [...prev, steps[i]]);
    }
    await new Promise((r) => setTimeout(r, 400));
    setMessages((m) => [
      ...m,
      { id: uid(), role: "agent", content: reply, steps },
    ]);
    setActiveSteps([]);
    setBusy(false);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Back</span>
          </Link>
          <div className="flex items-center gap-2">
            <Logo className="size-6" />
            <span className="font-medium tracking-tight text-[15px]">
              Discoverse <span className="text-muted-foreground">Agent</span>
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-foreground animate-pulse" />
            Live
          </div>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}

          {busy && activeSteps.length > 0 && (
            <TraceCard steps={activeSteps} live />
          )}

          {messages.length === 1 && !busy && (
            <div className="pt-4">
              <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-3">
                Try a directive
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="text-left text-sm border border-border rounded-lg px-4 py-3 hover:bg-muted transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-background/90 backdrop-blur-xl">
        <form
          onSubmit={onSubmit}
          className="max-w-3xl mx-auto px-4 sm:px-6 py-3 sm:py-4"
        >
          <div className="relative flex items-end gap-2 border border-border rounded-2xl bg-background shadow-sm focus-within:border-foreground/40 transition-colors">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Give the agent an objective…"
              rows={1}
              className="flex-1 resize-none bg-transparent px-4 py-3.5 text-[15px] outline-none placeholder:text-muted-foreground max-h-40"
            />
            <button
              type="submit"
              disabled={!input.trim() || busy}
              className="m-1.5 inline-flex items-center justify-center size-10 rounded-xl bg-foreground text-background disabled:opacity-30 transition-opacity"
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground text-center">
            Demo agent · Connect OpenClaw, E2B & Weaviate to go live.
          </p>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={"flex " + (isUser ? "justify-end" : "justify-start")}>
      <div className={"max-w-[88%] sm:max-w-[80%] " + (isUser ? "" : "w-full")}>
        {!isUser && (
          <div className="flex items-center gap-2 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <Sparkles className="size-3" />
            Agent
          </div>
        )}
        <div
          className={
            isUser
              ? "bg-foreground text-background rounded-2xl rounded-br-md px-4 py-3 text-[15px] leading-relaxed"
              : "text-[15px] leading-relaxed text-foreground whitespace-pre-wrap"
          }
        >
          {message.content}
        </div>
        {message.steps && <TraceCard steps={message.steps} className="mt-3" />}
      </div>
    </div>
  );
}

function TraceCard({
  steps,
  live,
  className = "",
}: {
  steps: Step[];
  live?: boolean;
  className?: string;
}) {
  return (
    <div
      className={
        "border border-border rounded-xl bg-muted/40 overflow-hidden " +
        className
      }
    >
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <span className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          Agent trace
        </span>
        {live && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-foreground animate-pulse" />
            running
          </span>
        )}
      </div>
      <ul className="divide-y divide-border">
        {steps.map((s, i) => (
          <li
            key={i}
            className="px-4 py-2.5 flex items-center gap-3 text-sm font-mono"
          >
            {s.kind === "reason" && <Cpu className="size-3.5 shrink-0" />}
            {s.kind === "tool" && <Box className="size-3.5 shrink-0" />}
            {s.kind === "memory" && <Database className="size-3.5 shrink-0" />}
            <span className="text-foreground">{s.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
