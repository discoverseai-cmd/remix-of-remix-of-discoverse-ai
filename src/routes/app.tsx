import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUp,
  Sparkles,
  Cpu,
  Database,
  Box,
  Square,
  Trash2,
  Plus,
  PanelLeft,
  MessageSquare,
  X,
  Pencil,
  Check,
  Search,
} from "lucide-react";
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

type Role = "user" | "agent" | "system";
type Step = { kind: "reason" | "tool" | "memory"; label: string };
type Message = {
  id: string;
  role: Role;
  content: string;
  steps?: Step[];
  interrupted?: boolean;
};
type Session = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
};
type Store = {
  sessions: Session[];
  activeId: string;
};

const STORAGE_KEY = "discoverse.chat.v2";

const SUGGESTIONS = [
  "Research the latest in autonomous agents and summarize",
  "Write & run a Python script that scrapes Hacker News",
  "Recall what we discussed about vector memory",
  "Plan a 3-step automation for daily reports",
];

const WELCOME: Message = {
  id: "welcome",
  role: "agent",
  content:
    "I'm Discoverse — an autonomous agent. Tell me an objective and I'll plan, execute in a sandbox, and remember it.",
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function newSession(): Session {
  return {
    id: uid(),
    title: "New chat",
    messages: [WELCOME],
    updatedAt: Date.now(),
  };
}

function planSteps(): Step[] {
  return [
    { kind: "reason", label: "OpenClaw · planning task graph" },
    { kind: "memory", label: "Weaviate · retrieving long-term context" },
    { kind: "tool", label: "E2B · executing sandboxed step" },
    { kind: "reason", label: "OpenClaw · synthesizing result" },
  ];
}

function loadStore(): Store {
  if (typeof window === "undefined") {
    const s = newSession();
    return { sessions: [s], activeId: s.id };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      if (parsed?.sessions?.length) {
        const activeId = parsed.sessions.some((s) => s.id === parsed.activeId)
          ? parsed.activeId
          : parsed.sessions[0].id;
        return { sessions: parsed.sessions, activeId };
      }
    }
    // Migrate v1 single-chat storage if present.
    const legacy = window.localStorage.getItem("discoverse.chat.v1");
    if (legacy) {
      const messages = JSON.parse(legacy) as Message[];
      const s: Session = {
        id: uid(),
        title: deriveTitle(messages) ?? "Previous chat",
        messages: messages?.length ? messages : [WELCOME],
        updatedAt: Date.now(),
      };
      return { sessions: [s], activeId: s.id };
    }
  } catch {
    /* ignore */
  }
  const s = newSession();
  return { sessions: [s], activeId: s.id };
}

function deriveTitle(messages: Message[]): string | null {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return null;
  const t = firstUser.content.replace(/\s+/g, " ").trim();
  return t.length > 48 ? t.slice(0, 48) + "…" : t;
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function AgentApp() {
  const [hydrated, setHydrated] = useState(false);
  const [store, setStore] = useState<Store>(() => {
    const s = newSession();
    return { sessions: [s], activeId: s.id };
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeSteps, setActiveSteps] = useState<Step[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false); // mobile drawer
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false); // desktop
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setStore(loadStore());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* ignore */
    }
  }, [store, hydrated]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const activeSession =
    store.sessions.find((s) => s.id === store.activeId) ?? store.sessions[0];
  const messages = activeSession?.messages ?? [WELCOME];

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, activeSteps]);

  const sortedSessions = useMemo(
    () => [...store.sessions].sort((a, b) => b.updatedAt - a.updatedAt),
    [store.sessions]
  );

  function updateActiveSession(updater: (s: Session) => Session) {
    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === prev.activeId ? updater(s) : s
      ),
    }));
  }

  function selectSession(id: string) {
    if (id === store.activeId) {
      setSidebarOpen(false);
      return;
    }
    abortRef.current?.abort();
    setActiveSteps([]);
    setBusy(false);
    setStore((prev) => ({ ...prev, activeId: id }));
    setSidebarOpen(false);
  }

  function startNewChat() {
    abortRef.current?.abort();
    setActiveSteps([]);
    setBusy(false);
    const s = newSession();
    setStore((prev) => ({
      sessions: [s, ...prev.sessions],
      activeId: s.id,
    }));
    setSidebarOpen(false);
  }

  function deleteSession(id: string) {
    setStore((prev) => {
      const remaining = prev.sessions.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const s = newSession();
        if (prev.activeId === id) abortRef.current?.abort();
        return { sessions: [s], activeId: s.id };
      }
      const activeId =
        prev.activeId === id ? remaining[0].id : prev.activeId;
      if (prev.activeId === id) {
        abortRef.current?.abort();
        setActiveSteps([]);
        setBusy(false);
      }
      return { sessions: remaining, activeId };
    });
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    const userMsg: Message = { id: uid(), role: "user", content: trimmed };
    const sessionId = store.activeId;

    updateActiveSession((s) => {
      const messages = [...s.messages, userMsg];
      return {
        ...s,
        messages,
        title:
          s.title === "New chat"
            ? deriveTitle(messages) ?? s.title
            : s.title,
        updatedAt: Date.now(),
      };
    });
    setInput("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const steps = planSteps();
    const completed: Step[] = [];
    setActiveSteps([]);

    const appendIfActive = (msg: Message) => {
      setStore((prev) => {
        if (!prev.sessions.some((s) => s.id === sessionId)) return prev;
        return {
          ...prev,
          sessions: prev.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: [...s.messages, msg],
                  updatedAt: Date.now(),
                }
              : s
          ),
        };
      });
    };

    try {
      for (const step of steps) {
        await wait(650, signal);
        completed.push(step);
        setActiveSteps([...completed]);
      }
      await wait(400, signal);
      appendIfActive({
        id: uid(),
        role: "agent",
        content: `I planned a ${steps.length}-step trace for: "${trimmed}".\n\nThe sandbox executed cleanly and I stored the new context as an episodic memory. Ask a follow-up to refine, or push this trace to a recurring workflow.`,
        steps,
      });
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        appendIfActive({
          id: uid(),
          role: "agent",
          content:
            completed.length === 0
              ? "Run stopped before the agent began executing."
              : `Run stopped after ${completed.length} of ${steps.length} steps. Partial trace preserved below.`,
          steps: completed.length > 0 ? completed : undefined,
          interrupted: true,
        });
      } else {
        appendIfActive({
          id: uid(),
          role: "agent",
          content: "The agent encountered an unexpected error. Try again.",
          interrupted: true,
        });
      }
    } finally {
      setActiveSteps([]);
      setBusy(false);
      abortRef.current = null;
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) {
      stop();
      return;
    }
    send(input);
  }

  return (
    <div className="min-h-dvh flex bg-background text-foreground">
      {/* Mobile drawer overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={
          "fixed md:sticky md:top-0 inset-y-0 left-0 z-50 md:z-10 h-dvh bg-background border-r border-border flex flex-col transition-[transform,width] duration-300 ease-out " +
          (sidebarOpen ? "translate-x-0 " : "-translate-x-full ") +
          "md:translate-x-0 " +
          (sidebarCollapsed ? "md:w-[68px] " : "md:w-72 ") +
          "w-[82vw] max-w-80"
        }
      >
        <div className="h-14 px-3 flex items-center justify-between border-b border-border shrink-0">
          <Link
            to="/"
            className={
              "flex items-center gap-2 min-w-0 " +
              (sidebarCollapsed ? "md:justify-center md:w-full" : "")
            }
            title="Back to home"
          >
            <Logo className="size-6 shrink-0" />
            {!sidebarCollapsed && (
              <span className="font-medium tracking-tight text-[15px] truncate">
                Discoverse
              </span>
            )}
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden inline-flex items-center justify-center size-8 rounded-md hover:bg-muted"
            aria-label="Close sidebar"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-2 shrink-0">
          <button
            onClick={startNewChat}
            className={
              "w-full inline-flex items-center gap-2 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm font-medium " +
              (sidebarCollapsed
                ? "md:justify-center md:px-0 md:py-2.5 px-3 py-2.5"
                : "px-3 py-2.5")
            }
            title="New chat"
          >
            <Plus className="size-4 shrink-0" />
            {!sidebarCollapsed && <span>New chat</span>}
          </button>
        </div>

        {!sidebarCollapsed && (
          <div className="px-4 pt-2 pb-1">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              Sessions
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {sortedSessions.map((s) => {
            const active = s.id === store.activeId;
            return (
              <div
                key={s.id}
                className={
                  "group relative rounded-lg transition-colors " +
                  (active
                    ? "bg-muted text-foreground"
                    : "hover:bg-muted/60 text-muted-foreground hover:text-foreground")
                }
              >
                <button
                  onClick={() => selectSession(s.id)}
                  className={
                    "w-full text-left flex items-center gap-2.5 text-sm " +
                    (sidebarCollapsed
                      ? "md:justify-center md:px-0 md:py-2.5 px-3 py-2.5"
                      : "px-3 py-2.5 pr-9")
                  }
                  title={s.title}
                >
                  <MessageSquare className="size-3.5 shrink-0" />
                  {!sidebarCollapsed && (
                    <span className="truncate">{s.title}</span>
                  )}
                </button>
                {!sidebarCollapsed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(s.id);
                    }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 size-7 inline-flex items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background hover:text-foreground transition-opacity"
                    aria-label="Delete chat"
                    title="Delete chat"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="border-t border-border p-2 shrink-0 hidden md:block">
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className={
              "w-full inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground rounded-md py-2 transition-colors " +
              (sidebarCollapsed ? "justify-center" : "px-2")
            }
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeft className="size-4" />
            {!sidebarCollapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 min-w-0 flex flex-col min-h-dvh">
        <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-xl">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden inline-flex items-center justify-center size-9 -ml-2 rounded-md hover:bg-muted"
                aria-label="Open chats"
              >
                <PanelLeft className="size-4" />
              </button>
              <Link
                to="/"
                className="hidden md:inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="size-4" />
                <span>Home</span>
              </Link>
              <span className="hidden md:inline text-muted-foreground">·</span>
              <span className="font-medium tracking-tight text-[15px] truncate">
                {activeSession?.title ?? "New chat"}
              </span>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground shrink-0">
              <span
                className={
                  "size-1.5 rounded-full " +
                  (busy ? "bg-foreground animate-pulse" : "bg-foreground/40")
                }
              />
              {busy ? "Running" : "Idle"}
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

            {messages.length <= 1 && !busy && (
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
                    if (busy) stop();
                    else send(input);
                  }
                }}
                placeholder={
                  busy
                    ? "Agent is running… press stop to interrupt"
                    : "Give the agent an objective…"
                }
                rows={1}
                disabled={busy}
                className="flex-1 resize-none bg-transparent px-4 py-3.5 text-[15px] outline-none placeholder:text-muted-foreground max-h-40 disabled:opacity-60"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={stop}
                  className="m-1.5 inline-flex items-center justify-center size-10 rounded-xl bg-foreground text-background hover:opacity-90 transition-opacity"
                  aria-label="Stop agent"
                  title="Stop agent"
                >
                  <Square className="size-4 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="m-1.5 inline-flex items-center justify-center size-10 rounded-xl bg-foreground text-background disabled:opacity-30 transition-opacity"
                  aria-label="Send"
                >
                  <ArrowUp className="size-4" />
                </button>
              )}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground text-center">
              {busy
                ? "Click stop to abort the run mid-execution."
                : "Demo agent · Connect OpenClaw, E2B & Weaviate to go live."}
            </p>
          </form>
        </div>
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
            {message.interrupted && (
              <span className="inline-flex items-center gap-1 text-foreground/70">
                · stopped
              </span>
            )}
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
        {message.steps && (
          <TraceCard
            steps={message.steps}
            interrupted={message.interrupted}
            className="mt-3"
          />
        )}
      </div>
    </div>
  );
}

function TraceCard({
  steps,
  live,
  interrupted,
  className = "",
}: {
  steps: Step[];
  live?: boolean;
  interrupted?: boolean;
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
        {interrupted && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-foreground/50" />
            stopped
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
