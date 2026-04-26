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
  Paperclip,
  FileText,
  FileArchive,
  FileVideo,
  FileAudio,
  File as FileIcon,
  Download,
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
type AttachmentKind = "image" | "video" | "audio" | "archive" | "document" | "file";
type Attachment = {
  id: string;
  name: string;
  size: number;
  mime: string;
  kind: AttachmentKind;
  /** data: URL (small files) or null when too large to persist */
  dataUrl: string | null;
};
type Message = {
  id: string;
  role: Role;
  content: string;
  steps?: Step[];
  interrupted?: boolean;
  attachments?: Attachment[];
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

const STORAGE_KEY = "discoverse.chat.v3";
const MAX_PERSIST_BYTES = 5 * 1024 * 1024; // 5MB per file kept inline
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB hard cap
const MAX_FILES_PER_MESSAGE = 10;

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
    // Migrate older session storage (v2) or single-chat (v1).
    const v2 = window.localStorage.getItem("discoverse.chat.v2");
    if (v2) {
      const parsed = JSON.parse(v2) as Store;
      if (parsed?.sessions?.length) return parsed;
    }
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
  if (t) return t.length > 48 ? t.slice(0, 48) + "…" : t;
  if (firstUser.attachments?.length) {
    const a = firstUser.attachments[0];
    return firstUser.attachments.length > 1
      ? `${a.name} +${firstUser.attachments.length - 1}`
      : a.name;
  }
  return null;
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

const ARCHIVE_EXTS = ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"];
const DOC_EXTS = [
  "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx",
  "txt", "md", "csv", "json", "xml", "yaml", "yml", "log",
];

function detectKind(file: File): AttachmentKind {
  const mime = file.type.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ARCHIVE_EXTS.includes(ext) || mime.includes("zip") || mime.includes("compressed"))
    return "archive";
  if (DOC_EXTS.includes(ext) || mime.startsWith("text/") || mime.includes("pdf") || mime.includes("officedocument"))
    return "document";
  return "file";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Read failed"));
    r.readAsDataURL(file);
  });
}

async function fileToAttachment(file: File): Promise<Attachment> {
  const kind = detectKind(file);
  let dataUrl: string | null = null;
  if (file.size <= MAX_PERSIST_BYTES) {
    try {
      dataUrl = await readAsDataURL(file);
    } catch {
      dataUrl = null;
    }
  }
  return {
    id: uid(),
    name: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream",
    kind,
    dataUrl,
  };
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
  const [query, setQuery] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedSessions;
    return sortedSessions.filter((s) => {
      if (s.title.toLowerCase().includes(q)) return true;
      return s.messages.some((m) => m.content.toLowerCase().includes(q));
    });
  }, [sortedSessions, query]);

  function beginRename(s: Session) {
    setRenameId(s.id);
    setRenameDraft(s.title);
  }

  function commitRename() {
    const id = renameId;
    if (!id) return;
    const next = renameDraft.trim();
    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === id ? { ...s, title: next || s.title } : s
      ),
    }));
    setRenameId(null);
    setRenameDraft("");
  }

  function cancelRename() {
    setRenameId(null);
    setRenameDraft("");
  }

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

  async function addFiles(files: FileList | File[]) {
    setAttachError(null);
    const arr = Array.from(files);
    if (arr.length === 0) return;
    const slotsLeft = MAX_FILES_PER_MESSAGE - pending.length;
    if (slotsLeft <= 0) {
      setAttachError(`Max ${MAX_FILES_PER_MESSAGE} files per message.`);
      return;
    }
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of arr.slice(0, slotsLeft)) {
      if (f.size > MAX_FILE_BYTES) rejected.push(`${f.name} (>20MB)`);
      else accepted.push(f);
    }
    if (arr.length > slotsLeft) rejected.push(`${arr.length - slotsLeft} extra file(s)`);
    const built = await Promise.all(accepted.map(fileToAttachment));
    setPending((prev) => [...prev, ...built]);
    if (rejected.length) setAttachError(`Skipped: ${rejected.join(", ")}`);
  }

  function removePending(id: string) {
    setPending((prev) => prev.filter((a) => a.id !== id));
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if ((!trimmed && pending.length === 0) || busy) return;
    const attachments = pending;
    const userMsg: Message = {
      id: uid(),
      role: "user",
      content: trimmed,
      attachments: attachments.length ? attachments : undefined,
    };
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
    setPending([]);
    setAttachError(null);
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
      const ackPrompt = trimmed || `${attachments.length} attached file${attachments.length === 1 ? "" : "s"}`;
      const fileNote = attachments.length
        ? `\n\nReceived ${attachments.length} attachment${attachments.length === 1 ? "" : "s"} (${attachments.map((a) => a.name).join(", ")}). They are available for inspection in the sandbox.`
        : "";
      appendIfActive({
        id: uid(),
        role: "agent",
        content: `I planned a ${steps.length}-step trace for: "${ackPrompt}".\n\nThe sandbox executed cleanly and I stored the new context as an episodic memory.${fileNote}`,
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
          <div className="px-3 pt-1 pb-2">
            <div className="relative">
              <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chats…"
                className="w-full pl-8 pr-7 py-2 text-sm bg-muted/50 border border-border rounded-md outline-none focus:border-foreground/40 focus:bg-background transition-colors placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 size-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-background"
                  aria-label="Clear search"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          </div>
        )}

        {!sidebarCollapsed && (
          <div className="px-4 pb-1 flex items-center justify-between">
            <p className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              {query ? "Results" : "Sessions"}
            </p>
            {query && (
              <span className="text-[11px] font-mono text-muted-foreground">
                {filteredSessions.length}
              </span>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          {filteredSessions.length === 0 && !sidebarCollapsed && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No chats match "{query}".
            </p>
          )}
          {filteredSessions.map((s) => {
            const active = s.id === store.activeId;
            const isRenaming = renameId === s.id;
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
                {isRenaming && !sidebarCollapsed ? (
                  <div className="flex items-center gap-1.5 px-2 py-1.5">
                    <MessageSquare className="size-3.5 shrink-0 ml-1" />
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitRename();
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          cancelRename();
                        }
                      }}
                      onBlur={commitRename}
                      className="flex-1 min-w-0 bg-background border border-foreground/30 rounded px-2 py-1 text-sm outline-none"
                    />
                    <button
                      onMouseDown={(e) => {
                        e.preventDefault();
                        commitRename();
                      }}
                      className="size-6 inline-flex items-center justify-center rounded text-foreground hover:bg-background"
                      aria-label="Save title"
                    >
                      <Check className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => selectSession(s.id)}
                      onDoubleClick={() => !sidebarCollapsed && beginRename(s)}
                      className={
                        "w-full text-left flex items-center gap-2.5 text-sm " +
                        (sidebarCollapsed
                          ? "md:justify-center md:px-0 md:py-2.5 px-3 py-2.5"
                          : "px-3 py-2.5 pr-16")
                      }
                      title={sidebarCollapsed ? s.title : `${s.title} — double-click to rename`}
                    >
                      <MessageSquare className="size-3.5 shrink-0" />
                      {!sidebarCollapsed && (
                        <span className="truncate">{s.title}</span>
                      )}
                    </button>
                    {!sidebarCollapsed && (
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            beginRename(s);
                          }}
                          className="size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                          aria-label="Rename chat"
                          title="Rename"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteSession(s.id);
                          }}
                          className="size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                          aria-label="Delete chat"
                          title="Delete"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  </>
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
      <div
        className="flex-1 min-w-0 flex flex-col min-h-dvh relative"
        onDragOver={(e) => {
          if (e.dataTransfer?.types?.includes("Files")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={(e) => {
          if (e.dataTransfer?.files?.length) {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }
          setDragOver(false);
        }}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-30 m-3 border-2 border-dashed border-foreground/40 rounded-2xl bg-background/80 backdrop-blur-sm flex items-center justify-center">
            <div className="text-center">
              <Paperclip className="size-6 mx-auto mb-2" />
              <p className="text-sm font-medium">Drop files to attach</p>
              <p className="text-xs text-muted-foreground mt-1">Up to 20MB · Max {MAX_FILES_PER_MESSAGE}</p>
            </div>
          </div>
        )}
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
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {pending.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {pending.map((a) => (
                  <PendingChip key={a.id} attachment={a} onRemove={() => removePending(a.id)} />
                ))}
              </div>
            )}
            {attachError && (
              <p className="mb-2 text-[11px] text-foreground/70">{attachError}</p>
            )}
            <div className="relative flex items-end gap-1 border border-border rounded-2xl bg-background shadow-sm focus-within:border-foreground/40 transition-colors">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || pending.length >= MAX_FILES_PER_MESSAGE}
                className="m-1.5 inline-flex items-center justify-center size-10 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                aria-label="Attach files"
                title="Attach files"
              >
                <Paperclip className="size-4" />
              </button>
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
                    : "Give the agent an objective or drop files…"
                }
                rows={1}
                disabled={busy}
                className="flex-1 resize-none bg-transparent pl-1 pr-2 py-3.5 text-[15px] outline-none placeholder:text-muted-foreground max-h-40 disabled:opacity-60"
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
                  disabled={!input.trim() && pending.length === 0}
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
