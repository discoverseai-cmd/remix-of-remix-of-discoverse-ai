import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  GripVertical,
  LogOut,
  Loader2,
  UserCog,
  ChevronDown,
  ChevronRight,
  Activity,
} from "lucide-react";
import { Logo } from "../components/site/Logo";
import { useAuth } from "../hooks/use-auth";
import { supabase } from "../integrations/supabase/client";

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
type TimelineEventKind =
  | "prompt"
  | "attachments"
  | "request"
  | "stream_start"
  | "tokens"
  | "stream_end"
  | "stop"
  | "error";
type TimelineEvent = {
  id: string;
  ts: number;
  kind: TimelineEventKind;
  label: string;
  detail?: string;
};
type AttachmentKind = "image" | "video" | "audio" | "archive" | "document" | "file";
type Attachment = {
  id: string;
  name: string;
  size: number;
  mime: string;
  kind: AttachmentKind;
  /** Path inside the chat-attachments storage bucket (set after upload). */
  storagePath?: string | null;
  /** Local-only File handle pending upload (not persisted, not serialized to DB). */
  file?: File;
  /** Live URL (signed, or local blob preview) — not persisted. */
  dataUrl: string | null;
};
type Message = {
  id: string;
  role: Role;
  content: string;
  steps?: Step[];
  interrupted?: boolean;
  attachments?: Attachment[];
  timeline?: TimelineEvent[];
  stopReason?: string;
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

const ATTACHMENTS_BUCKET = "chat-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour signed URLs
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB hard cap
const MAX_FILES_PER_MESSAGE = 10;
const CHAT_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
const CHAT_MODEL = "google/gemini-2.5-flash";

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
  // Local preview only — this URL won't be persisted.
  let dataUrl: string | null = null;
  try {
    dataUrl = URL.createObjectURL(file);
  } catch {
    dataUrl = null;
  }
  return {
    id: uid(),
    name: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream",
    kind,
    dataUrl,
    file,
  };
}

/** Upload a single attachment to the chat-attachments bucket (idempotent). */
async function uploadAttachment(
  att: Attachment,
  userId: string,
  sessionId: string
): Promise<Attachment> {
  if (att.storagePath || !att.file) return att;
  const safeName = att.name.replace(/[^\w.\-]+/g, "_");
  const path = `${userId}/${sessionId}/${att.id}-${safeName}`;
  const { error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(path, att.file, {
      contentType: att.mime || "application/octet-stream",
      upsert: false,
    });
  if (error) {
    console.error("Attachment upload failed", error);
    return att;
  }
  return { ...att, storagePath: path };
}

/** Strip non-serializable fields before writing to the DB. */
function serializeAttachment(att: Attachment) {
  return {
    id: att.id,
    name: att.name,
    size: att.size,
    mime: att.mime,
    kind: att.kind,
    storagePath: att.storagePath ?? null,
  };
}

/** Resolve signed URLs for stored attachments after hydration. */
async function hydrateAttachments(
  attachments: Attachment[] | null | undefined
): Promise<Attachment[] | undefined> {
  if (!attachments || attachments.length === 0) return undefined;
  const paths = attachments
    .map((a) => a.storagePath)
    .filter((p): p is string => !!p);
  if (paths.length === 0) return attachments.map((a) => ({ ...a, dataUrl: null }));
  const { data } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  const byPath = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) byPath.set(row.path, row.signedUrl);
  }
  return attachments.map((a) => ({
    ...a,
    dataUrl: a.storagePath ? byPath.get(a.storagePath) ?? null : null,
  }));
}

function AgentApp() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

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
  const [lastSent, setLastSent] = useState<Attachment[]>([]);
  const [reuseLast, setReuseLast] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [runEvents, setRunEvents] = useState<TimelineEvent[]>([]);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [streamStatus, setStreamStatus] = useState<"idle" | "streaming" | "done">(
    "idle"
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) return;
      // Try DB first
      const { data: sessRows } = await supabase
        .from("chat_sessions")
        .select("id, title, updated_at")
        .order("updated_at", { ascending: false });
      if (cancelled) return;
      if (sessRows && sessRows.length > 0) {
        const ids = sessRows.map((s) => s.id);
        const { data: msgRows } = await supabase
          .from("chat_messages")
          .select("id, session_id, role, content, attachments, steps, interrupted, timeline, stop_reason, created_at")
          .in("session_id", ids)
          .order("created_at", { ascending: true });
        if (cancelled) return;
        const byId: Record<string, Message[]> = {};
        const hydratedRows = await Promise.all(
          (msgRows ?? []).map(async (row) => {
            const attachments = await hydrateAttachments(
              (row.attachments as Attachment[] | null) ?? undefined
            );
            return { row, attachments };
          })
        );
        if (cancelled) return;
        for (const { row, attachments } of hydratedRows) {
          (byId[row.session_id] ||= []).push({
            id: row.id,
            role: row.role as Role,
            content: row.content,
            attachments,
            steps: (row.steps as Step[] | null) ?? undefined,
            interrupted: row.interrupted ?? undefined,
            timeline:
              ((row as { timeline?: TimelineEvent[] | null }).timeline as
                | TimelineEvent[]
                | null) ?? undefined,
            stopReason:
              ((row as { stop_reason?: string | null }).stop_reason as
                | string
                | null) ?? undefined,
          });
        }
        const sessions: Session[] = sessRows.map((s) => ({
          id: s.id,
          title: s.title,
          messages: byId[s.id]?.length ? byId[s.id] : [WELCOME],
          updatedAt: new Date(s.updated_at).getTime(),
        }));
        setStore({ sessions, activeId: sessions[0].id });
      } else {
        // Create first session in DB
        const { data: created } = await supabase
          .from("chat_sessions")
          .insert({ user_id: user.id, title: "New chat" })
          .select("id, title, updated_at")
          .single();
        if (cancelled || !created) return;
        setStore({
          sessions: [
            {
              id: created.id,
              title: created.title,
              messages: [WELCOME],
              updatedAt: new Date(created.updated_at).getTime(),
            },
          ],
          activeId: created.id,
        });
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Persistence is now handled per-mutation against the DB.

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
    const finalTitle = next || undefined;
    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === id ? { ...s, title: next || s.title } : s
      ),
    }));
    setRenameId(null);
    setRenameDraft("");
    if (finalTitle) {
      void supabase
        .from("chat_sessions")
        .update({ title: finalTitle, updated_at: new Date().toISOString() })
        .eq("id", id)
        .then(({ error }) => {
          if (error) console.error("Failed to rename chat session", error);
        });
    }
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
    setPending([]);
    setLastSent([]);
    setReuseLast(false);
    setAttachError(null);
    setStore((prev) => ({ ...prev, activeId: id }));
    setSidebarOpen(false);
  }

  async function startNewChat() {
    abortRef.current?.abort();
    setActiveSteps([]);
    setBusy(false);
    setPending([]);
    setLastSent([]);
    setReuseLast(false);
    setAttachError(null);
    setSidebarOpen(false);
    if (!user) return;
    const { data: created, error } = await supabase
      .from("chat_sessions")
      .insert({ user_id: user.id, title: "New chat" })
      .select("id, title, updated_at")
      .single();
    if (error || !created) return;
    const s: Session = {
      id: created.id,
      title: created.title,
      messages: [WELCOME],
      updatedAt: new Date(created.updated_at).getTime(),
    };
    setStore((prev) => ({
      sessions: [s, ...prev.sessions],
      activeId: s.id,
    }));
  }

  function deleteSession(id: string) {
    void supabase
      .from("chat_sessions")
      .delete()
      .eq("id", id)
      .then(({ error }) => {
        if (error) console.error("Failed to delete chat session", error);
      });
    setStore((prev) => {
      const remaining = prev.sessions.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        if (prev.activeId === id) abortRef.current?.abort();
        // Recreate one async; for now, leave empty and rely on next startNewChat
        if (user) {
          void supabase
            .from("chat_sessions")
            .insert({ user_id: user.id, title: "New chat" })
            .select("id, title, updated_at")
            .single()
            .then(({ data }) => {
              if (!data) return;
              const s: Session = {
                id: data.id,
                title: data.title,
                messages: [WELCOME],
                updatedAt: new Date(data.updated_at).getTime(),
              };
              setStore({ sessions: [s], activeId: s.id });
            });
        }
        return { sessions: [], activeId: "" };
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

  function reorderPending(fromId: string, toId: string) {
    if (fromId === toId) return;
    setPending((prev) => {
      const from = prev.findIndex((a) => a.id === fromId);
      const to = prev.findIndex((a) => a.id === toId);
      if (from < 0 || to < 0) return prev;
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (busy) return;
    if (!user) return;
    const sessionId = store.activeId;
    if (!sessionId) return;
    // Combine current pending with reused-last attachments (dedup by id).
    const reused = reuseLast ? lastSent.filter((a) => !pending.some((p) => p.id === a.id)) : [];
    const attachmentsRaw = [...pending, ...reused];
    if (!trimmed && attachmentsRaw.length === 0) return;
    setBusy(true);
    setStreamStatus("idle");
    // Upload pending attachments to cloud storage; reused already have storagePath.
    const attachments = await Promise.all(
      attachmentsRaw.map((a) =>
        a.storagePath ? Promise.resolve(a) : uploadAttachment(a, user.id, sessionId)
      )
    );
    const userMsgId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : uid();
    const userMsg: Message = {
      id: userMsgId,
      role: "user",
      content: trimmed,
      attachments: attachments.length ? attachments : undefined,
    };

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
    if (attachments.length) setLastSent(attachments);
    setReuseLast(false);
    const events: TimelineEvent[] = [];
    const pushEvent = (
      kind: TimelineEventKind,
      label: string,
      detail?: string
    ) => {
      events.push({ id: uid(), ts: Date.now(), kind, label, detail });
      setRunEvents([...events]);
    };
    setRunEvents([]);
    setTimelineOpen(true);
    pushEvent(
      "prompt",
      "Prompt built",
      `${trimmed.length} chars · ${
        (activeSession?.messages.filter((m) => m.id !== "welcome").length ?? 0) + 1
      } turns`
    );
    if (attachments.length) {
      pushEvent(
        "attachments",
        "Attachments processed",
        attachments.map((a) => a.name).join(", ")
      );
    }

    // Persist user message + maybe-updated title to DB before the run starts.
    const { error: userMsgError } = await supabase.from("chat_messages").insert({
      id: userMsgId,
      session_id: sessionId,
      user_id: user.id,
      role: "user",
      content: trimmed,
      attachments: attachments.length ? attachments.map(serializeAttachment) : null,
    });
    if (userMsgError) {
      console.error("Failed to save user message", userMsgError);
      setBusy(false);
      setAttachError("Could not save this message. Please try again.");
      return;
    }
    const newTitle =
      activeSession?.title === "New chat"
        ? deriveTitle([...(activeSession?.messages ?? []), userMsg])
        : null;
    if (newTitle) {
      const { error: titleError } = await supabase
        .from("chat_sessions")
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (titleError) console.error("Failed to update chat title", titleError);
    } else {
      const { error: touchError } = await supabase
        .from("chat_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", sessionId);
      if (touchError) console.error("Failed to update chat timestamp", touchError);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    setActiveSteps([]);

    // Build conversation context from current session (excluding the welcome message)
    const convo: Array<{ role: Role; content: string; attachments?: Attachment[] }> = [
      ...(activeSession?.messages ?? [])
        .filter((m) => m.id !== "welcome")
        .map((m) => ({ role: m.role, content: m.content, attachments: m.attachments })),
      { role: "user" as Role, content: trimmed, attachments },
    ];

    const assistantId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : uid();

    // Insert empty assistant placeholder into UI
    setStore((prev) => {
      if (!prev.sessions.some((s) => s.id === sessionId)) return prev;
      return {
        ...prev,
        sessions: prev.sessions.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                messages: [...s.messages, { id: assistantId, role: "agent", content: "" }],
                updatedAt: Date.now(),
              }
            : s
        ),
      };
    });

    let acc = "";
    let interrupted = false;
    let errorMsg: string | null = null;
    let tokenCount = 0;
    let stopReason: string = "completed";

    const updateAssistant = (content: string, extra?: Partial<Message>) => {
      setStore((prev) => {
        if (!prev.sessions.some((s) => s.id === sessionId)) return prev;
        return {
          ...prev,
          sessions: prev.sessions.map((s) =>
            s.id === sessionId
              ? {
                  ...s,
                  messages: s.messages.map((m) =>
                    m.id === assistantId ? { ...m, content, ...extra } : m
                  ),
                }
              : s
          ),
        };
      });
    };

    try {
      pushEvent("request", "Request sent", `model ${CHAT_MODEL}`);
      const resp = await fetch(CHAT_FN_URL, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: convo.map((m) => ({
            role: m.role,
            content: m.content,
            attachments: m.attachments?.map((a) => ({
              name: a.name,
              mime: a.mime,
              dataUrl: a.dataUrl,
            })),
          })),
        }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) errorMsg = "Rate limit hit. Try again in a moment.";
        else if (resp.status === 402)
          errorMsg = "AI credits exhausted. Add funds in workspace settings.";
        else errorMsg = "The agent could not be reached.";
        throw new Error(errorMsg);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let done = false;
      pushEvent("stream_start", "Stream opened");
      setStreamStatus("streaming");
      while (!done) {
        const { value, done: d } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line || line.startsWith(":")) continue;
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") {
            done = true;
            break;
          }
          try {
            const parsed = JSON.parse(payload);
            const delta = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (delta) {
              acc += delta;
              tokenCount += 1;
              updateAssistant(acc);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") {
        interrupted = true;
        stopReason = "user stopped";
      } else if (!errorMsg) {
        errorMsg = (err as Error).message || "Unexpected error.";
        stopReason = "error";
      }
    } finally {
      let finalContent = acc;
      if (interrupted) {
        finalContent = acc
          ? acc + "\n\n_[Run stopped]_"
          : "Run stopped before the agent responded.";
      } else if (errorMsg && !acc) {
        finalContent = errorMsg;
        stopReason = "error";
      }
      if (tokenCount > 0) {
        pushEvent("tokens", "Tokens streamed", `${tokenCount} chunks · ${acc.length} chars`);
      }
      if (errorMsg) {
        pushEvent("error", "Error", errorMsg);
      }
      pushEvent("stream_end", "Stream closed", `stop: ${stopReason}`);

      const finalTimeline = [...events];
      updateAssistant(finalContent, {
        interrupted: interrupted || (!!errorMsg && !acc),
        timeline: finalTimeline,
        stopReason,
      });

      // Persist final assistant message (with timeline + stop reason)
      const { error: assistantMsgError } = await supabase.from("chat_messages").insert({
        id: assistantId,
        session_id: sessionId,
        user_id: user.id,
        role: "agent",
        content: finalContent,
        interrupted: interrupted || (!!errorMsg && !acc),
        timeline: finalTimeline,
        stop_reason: stopReason,
      });
      if (assistantMsgError) {
        console.error("Failed to save assistant message", assistantMsgError);
      }

      setActiveSteps([]);
      setBusy(false);
      setStreamStatus("done");
      abortRef.current = null;
      window.setTimeout(() => {
        setStreamStatus((s) => (s === "done" ? "idle" : s));
      }, 4000);
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

  if (authLoading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
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

        <div
          className="border-t border-border p-2 shrink-0"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          <UserMenu
            email={user.email ?? ""}
            collapsed={sidebarCollapsed}
            running={busy}
            activeTitle={activeSession?.title ?? "New chat"}
          />
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
                  (streamStatus === "streaming"
                    ? "bg-emerald-500 animate-pulse"
                    : streamStatus === "done"
                    ? "bg-emerald-500"
                    : busy
                    ? "bg-foreground animate-pulse"
                    : "bg-foreground/40")
                }
              />
              {streamStatus === "streaming"
                ? "Streaming…"
                : streamStatus === "done"
                ? "Done"
                : busy
                ? "Running"
                : "Idle"}
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

            {busy && runEvents.length > 0 && (
              <RunTimeline
                events={runEvents}
                open={timelineOpen}
                onToggle={() => setTimelineOpen((v) => !v)}
                streaming={streamStatus === "streaming"}
              />
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
              <div className="mb-2">
                <div className="flex flex-wrap gap-2">
                  {pending.map((a, i) => (
                    <PendingChip
                      key={a.id}
                      attachment={a}
                      index={i}
                      total={pending.length}
                      isDragging={dragId === a.id}
                      isDragOver={dragOverId === a.id && dragId !== a.id}
                      onRemove={() => removePending(a.id)}
                      onDragStart={() => setDragId(a.id)}
                      onDragEnter={() => dragId && setDragOverId(a.id)}
                      onDragOver={(e) => {
                        if (dragId) e.preventDefault();
                      }}
                      onDrop={() => {
                        if (dragId) reorderPending(dragId, a.id);
                        setDragId(null);
                        setDragOverId(null);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDragOverId(null);
                      }}
                      onMoveLeft={i > 0 ? () => reorderPending(a.id, pending[i - 1].id) : undefined}
                      onMoveRight={i < pending.length - 1 ? () => reorderPending(a.id, pending[i + 1].id) : undefined}
                    />
                  ))}
                </div>
                {pending.length > 1 && (
                  <p className="mt-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
                    Drag to reorder · order matches what you'll send
                  </p>
                )}
              </div>
            )}
            {lastSent.length > 0 && !busy && (
              <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none w-fit">
                <input
                  type="checkbox"
                  checked={reuseLast}
                  onChange={(e) => setReuseLast(e.target.checked)}
                  className="size-4 accent-foreground rounded"
                />
                <span>
                  Use these attachments again
                  <span className="ml-1.5 font-mono text-foreground/70">
                    ({lastSent.length} file{lastSent.length === 1 ? "" : "s"})
                  </span>
                </span>
              </label>
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
  const [timelineOpen, setTimelineOpen] = useState(false);
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
        {message.attachments && message.attachments.length > 0 && (
          <AttachmentList attachments={message.attachments} alignEnd={isUser} className="mb-2" />
        )}
        {message.content && (
          <div
            className={
              isUser
                ? "bg-foreground text-background rounded-2xl rounded-br-md px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap"
                : "text-[15px] leading-relaxed text-foreground whitespace-pre-wrap"
            }
          >
            {message.content}
          </div>
        )}
        {message.steps && (
          <TraceCard
            steps={message.steps}
            interrupted={message.interrupted}
            className="mt-3"
          />
        )}
        {!isUser && message.timeline && message.timeline.length > 0 && (
          <RunTimeline
            events={message.timeline}
            open={timelineOpen}
            onToggle={() => setTimelineOpen((v) => !v)}
            stopReason={message.stopReason}
            errorMessage={
              message.interrupted && message.stopReason === "error"
                ? message.content
                : undefined
            }
            className="mt-3"
          />
        )}
      </div>
    </div>
  );
}

function kindIcon(kind: AttachmentKind) {
  if (kind === "video") return <FileVideo className="size-4" />;
  if (kind === "audio") return <FileAudio className="size-4" />;
  if (kind === "archive") return <FileArchive className="size-4" />;
  if (kind === "document") return <FileText className="size-4" />;
  return <FileIcon className="size-4" />;
}

function PendingChip({
  attachment,
  onRemove,
  index,
  total,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDrop,
  onDragEnd,
  onMoveLeft,
  onMoveRight,
}: {
  attachment: Attachment;
  onRemove: () => void;
  index: number;
  total: number;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
}) {
  const isImg = attachment.kind === "image" && attachment.dataUrl;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        try {
          e.dataTransfer.setData("text/plain", attachment.id);
        } catch {
          /* ignore */
        }
        onDragStart();
      }}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      aria-grabbed={isDragging}
      aria-label={`Attachment ${index + 1} of ${total}: ${attachment.name}`}
      className={
        "group relative inline-flex items-center gap-1 pl-0.5 pr-7 py-1 border rounded-lg bg-muted/60 max-w-[240px] transition-all touch-none cursor-grab active:cursor-grabbing " +
        (isDragging ? "opacity-40 border-foreground/40 " : "border-border ") +
        (isDragOver ? "ring-2 ring-foreground/40 ring-offset-1 ring-offset-background " : "")
      }
    >
      {total > 1 && (
        <span
          className="hidden sm:inline-flex items-center justify-center size-5 text-muted-foreground group-hover:text-foreground"
          aria-hidden
        >
          <GripVertical className="size-3.5" />
        </span>
      )}
      <span className="inline-flex items-center justify-center size-4 rounded text-[10px] font-mono text-muted-foreground tabular-nums shrink-0">
        {index + 1}
      </span>
      {isImg ? (
        <img
          src={attachment.dataUrl!}
          alt={attachment.name}
          className="size-8 rounded object-cover shrink-0"
          draggable={false}
        />
      ) : (
        <div className="size-8 rounded bg-background border border-border inline-flex items-center justify-center shrink-0 text-muted-foreground">
          {kindIcon(attachment.kind)}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium truncate">{attachment.name}</p>
        <p className="text-[10px] font-mono text-muted-foreground">
          {formatBytes(attachment.size)}
        </p>
      </div>
      {total > 1 && (
        <div className="sm:hidden flex flex-col -my-0.5 mr-0.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveLeft?.();
            }}
            disabled={!onMoveLeft}
            className="size-4 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Move earlier"
          >
            <span className="text-[10px] leading-none">▲</span>
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoveRight?.();
            }}
            disabled={!onMoveRight}
            className="size-4 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-30"
            aria-label="Move later"
          >
            <span className="text-[10px] leading-none">▼</span>
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-0.5 top-0.5 size-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-background"
        aria-label="Remove"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function AttachmentList({
  attachments,
  alignEnd,
  className = "",
}: {
  attachments: Attachment[];
  alignEnd?: boolean;
  className?: string;
}) {
  const images = attachments.filter((a) => a.kind === "image" && a.dataUrl);
  const others = attachments.filter((a) => !(a.kind === "image" && a.dataUrl));
  return (
    <div className={"flex flex-col gap-2 " + (alignEnd ? "items-end " : "") + className}>
      {images.length > 0 && (
        <>
          {/* Mobile: horizontal snap carousel */}
          <div
            className={
              "sm:hidden flex gap-2 overflow-x-auto snap-x snap-mandatory scroll-pl-1 -mx-1 px-1 pb-1 " +
              "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden " +
              (alignEnd ? "justify-end" : "")
            }
            aria-label={`${images.length} image${images.length === 1 ? "" : "s"}`}
          >
            {images.map((a) => (
              <a
                key={a.id}
                href={a.dataUrl!}
                target="_blank"
                rel="noreferrer"
                className="snap-start shrink-0 block rounded-lg overflow-hidden border border-border bg-muted/40 active:opacity-90 transition-opacity"
                style={{ width: images.length === 1 ? "min(85vw, 18rem)" : "min(70vw, 14rem)" }}
              >
                <img
                  src={a.dataUrl!}
                  alt={a.name}
                  className="w-full h-auto max-h-64 object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
          {/* Desktop / tablet: grid */}
          <div
            className={
              "hidden sm:grid gap-2 " +
              (images.length === 1
                ? "grid-cols-1 max-w-xs"
                : images.length === 2
                ? "grid-cols-2 max-w-md"
                : "grid-cols-2 md:grid-cols-3 max-w-lg")
            }
          >
            {images.map((a) => (
              <a
                key={a.id}
                href={a.dataUrl!}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg overflow-hidden border border-border bg-muted/40"
              >
                <img
                  src={a.dataUrl!}
                  alt={a.name}
                  className="w-full h-auto max-h-72 object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </>
      )}
      {others.map((a) => (
        <AttachmentCard key={a.id} attachment={a} />
      ))}
    </div>
  );
}

function AttachmentCard({ attachment }: { attachment: Attachment }) {
  const { kind, dataUrl, name, size, mime } = attachment;

  if (kind === "video" && dataUrl) {
    return (
      <div className="border border-border rounded-xl overflow-hidden bg-background max-w-md">
        <video src={dataUrl} controls className="w-full max-h-80 bg-black" />
        <FileMeta name={name} size={size} mime={mime} dataUrl={dataUrl} />
      </div>
    );
  }
  if (kind === "audio" && dataUrl) {
    return (
      <div className="border border-border rounded-xl overflow-hidden bg-background max-w-md p-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="size-9 rounded-md bg-muted inline-flex items-center justify-center">
            <FileAudio className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{name}</p>
            <p className="text-[11px] font-mono text-muted-foreground">{formatBytes(size)}</p>
          </div>
        </div>
        <audio src={dataUrl} controls className="w-full" />
      </div>
    );
  }

  const inner = (
    <>
      <div className="size-10 rounded-md bg-muted inline-flex items-center justify-center text-muted-foreground shrink-0">
        {kindIcon(kind)}
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-[11px] font-mono text-muted-foreground">
          {formatBytes(size)} · {kind}
          {!dataUrl && " · preview unavailable"}
        </p>
      </div>
      {dataUrl && (
        <Download className="size-4 text-muted-foreground shrink-0" aria-hidden />
      )}
    </>
  );
  const cls =
    "border border-border rounded-xl bg-background w-full max-w-md flex items-center gap-3 p-3 min-h-12 transition-colors";
  return dataUrl ? (
    <a
      href={dataUrl}
      download={name}
      className={cls + " hover:bg-muted active:bg-muted"}
      aria-label={`Download ${name}`}
    >
      {inner}
    </a>
  ) : (
    <div className={cls + " opacity-90"}>{inner}</div>
  );
}

function FileMeta({
  name,
  size,
  mime: _mime,
  dataUrl,
}: {
  name: string;
  size: number;
  mime: string;
  dataUrl: string | null;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 border-t border-border">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{name}</p>
        <p className="text-[11px] font-mono text-muted-foreground">{formatBytes(size)}</p>
      </div>
      {dataUrl && (
        <a
          href={dataUrl}
          download={name}
          className="size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
          aria-label="Download"
        >
          <Download className="size-3.5" />
        </a>
      )}
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

function RunTimeline({
  events,
  open,
  onToggle,
  streaming,
  stopReason,
  errorMessage,
  className = "",
}: {
  events: TimelineEvent[];
  open: boolean;
  onToggle: () => void;
  streaming?: boolean;
  stopReason?: string;
  errorMessage?: string;
  className?: string;
}) {
  const iconFor = (k: TimelineEventKind) => {
    switch (k) {
      case "prompt":
        return <Sparkles className="size-3.5 shrink-0" />;
      case "attachments":
        return <Paperclip className="size-3.5 shrink-0" />;
      case "request":
        return <Cpu className="size-3.5 shrink-0" />;
      case "stream_start":
        return <Activity className="size-3.5 shrink-0" />;
      case "tokens":
        return <Box className="size-3.5 shrink-0" />;
      case "stream_end":
        return <Check className="size-3.5 shrink-0" />;
      case "stop":
        return <Square className="size-3.5 shrink-0" />;
      case "error":
        return <X className="size-3.5 shrink-0 text-destructive" />;
    }
  };
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };
  const reason = stopReason && !streaming ? stopReason : null;
  const reasonStyle =
    reason === "completed"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
      : reason === "user stopped"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
      : reason === "error"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : "bg-muted text-muted-foreground border-border";
  const reasonLabel =
    reason === "completed"
      ? "Completed"
      : reason === "user stopped"
      ? "User stopped"
      : reason === "error"
      ? "Error"
      : reason ?? "";
  const ReasonIcon =
    reason === "completed" ? Check : reason === "user stopped" ? Square : reason === "error" ? X : Activity;
  return (
    <div className={"border border-border rounded-xl bg-muted/30 overflow-hidden " + className}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-muted/50 transition-colors"
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          {open ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          Run timeline
          <span className="text-foreground/70">· {events.length}</span>
        </span>
        {streaming ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            streaming
          </span>
        ) : reason ? (
          <span
            className={
              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-mono uppercase tracking-[0.16em] " +
              reasonStyle
            }
          >
            <ReasonIcon className="size-3" />
            {reasonLabel}
          </span>
        ) : null}
      </button>
      {reason && (
        <div className={"px-4 py-2.5 border-t border-b text-sm flex items-start gap-2.5 " + reasonStyle}>
          <ReasonIcon className="size-4 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Stop reason: {reasonLabel}</p>
            {errorMessage && reason === "error" && (
              <a
                href="#error-details"
                onClick={(e) => {
                  e.preventDefault();
                  if (!open) onToggle();
                  requestAnimationFrame(() => {
                    document
                      .getElementById("error-details")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" });
                  });
                }}
                className="mt-0.5 block text-xs underline underline-offset-2 opacity-90 hover:opacity-100 truncate"
                title={errorMessage}
              >
                {errorMessage}
              </a>
            )}
          </div>
        </div>
      )}
      {open && (
        <ol className="divide-y divide-border">
          {events.map((e) => (
            <li
              key={e.id}
              id={e.kind === "error" ? "error-details" : undefined}
              className="px-4 py-2 flex items-start gap-3 text-sm font-mono"
            >
              <span className="mt-0.5">{iconFor(e.kind)}</span>
              <span className="flex-1 min-w-0">
                <span className="text-foreground">{e.label}</span>
                {e.detail && (
                  <span className="block text-[11px] text-muted-foreground truncate">
                    {e.detail}
                  </span>
                )}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                {formatTime(e.ts)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function UserMenu({
  email,
  collapsed,
  running,
  activeTitle,
}: {
  email: string;
  collapsed?: boolean;
  running?: boolean;
  activeTitle?: string;
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const initial = (email[0] ?? "?").toUpperCase();
  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={
          "w-full inline-flex items-center gap-2.5 rounded-lg hover:bg-muted transition-colors text-left " +
          (collapsed ? "md:justify-center md:px-0 md:py-2 px-2 py-2" : "px-2 py-2")
        }
        aria-label="Account menu"
        aria-expanded={open}
        title={email || "Account"}
      >
        <span className="relative shrink-0">
          <span className="size-8 rounded-full bg-foreground text-background inline-flex items-center justify-center text-xs font-medium">
            {initial}
          </span>
          {running && (
            <span
              className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-emerald-500 ring-2 ring-background"
              aria-label="Agent running"
            >
              <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-75" />
            </span>
          )}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="text-sm font-medium truncate">
                {email.split("@")[0] || "Account"}
              </span>
              {running && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[9px] font-mono uppercase tracking-[0.14em] shrink-0">
                  <span className="size-1 rounded-full bg-emerald-500 animate-pulse" />
                  Live
                </span>
              )}
            </span>
            <span
              className="block text-[11px] text-muted-foreground truncate"
              title={running ? `Running: ${activeTitle}` : email}
            >
              {running ? `Running · ${activeTitle ?? "session"}` : email || "Signed in"}
            </span>
          </span>
        )}
      </button>
      {open && (
        <div
          className={
            "absolute bottom-full mb-2 w-56 rounded-xl border border-border bg-background shadow-lg overflow-hidden z-50 " +
            (collapsed ? "left-0" : "left-0 right-0 w-auto")
          }
        >
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              Signed in
            </p>
            <p className="mt-0.5 text-sm truncate">{email || "—"}</p>
            {running && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
                <span className="size-1 rounded-full bg-emerald-500 animate-pulse" />
                <span className="truncate">Running · {activeTitle}</span>
              </p>
            )}
          </div>
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-muted transition-colors border-b border-border"
          >
            <UserCog className="size-3.5" />
            Profile settings
          </Link>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left hover:bg-muted transition-colors"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
