import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Loader2,
  Check,
  AlertCircle,
  Link2,
  Unlink,
  Mail,
  LogOut,
} from "lucide-react";
import { supabase } from "../integrations/supabase/client";
import { lovable } from "../integrations/lovable";
import { useAuth } from "../hooks/use-auth";
import { Logo } from "../components/site/Logo";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({
    meta: [
      { title: "Profile settings — Discoverse Agent" },
      { name: "description", content: "Update your display name and manage connected sign-in providers." },
    ],
  }),
});

const PROVIDERS = [
  {
    id: "google" as const,
    label: "Google",
    description: "Sign in with your Google account.",
    mark: <GoogleMark />,
  },
];

function SettingsPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameOk, setNameOk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerBusy, setProviderBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const initial =
        (typeof meta.full_name === "string" && meta.full_name) ||
        (typeof meta.name === "string" && (meta.name as string)) ||
        "";
      setName(initial);
    }
  }, [user]);

  const linkedIds = useMemo(() => {
    const ids = (user?.identities ?? []).map((i) => i.provider);
    return new Set(ids);
  }, [user]);

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setError(null);
    setNameOk(false);
    setSavingName(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { full_name: name.trim(), name: name.trim() },
      });
      if (error) throw error;
      setNameOk(true);
      setTimeout(() => setNameOk(false), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update name.");
    } finally {
      setSavingName(false);
    }
  }

  async function linkProvider(id: "google") {
    setError(null);
    setProviderBusy(id);
    try {
      const result = await lovable.auth.signInWithOAuth(id, {
        redirect_uri: typeof window !== "undefined" ? `${window.location.origin}/settings` : undefined,
      });
      if (result.error) throw result.error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the connection.");
    } finally {
      setProviderBusy(null);
    }
  }

  async function unlinkProvider(id: "google") {
    if (!user) return;
    setError(null);
    setProviderBusy(id);
    try {
      const identity = (user.identities ?? []).find((i) => i.provider === id);
      if (!identity) throw new Error("Provider not linked.");
      const { error } = await supabase.auth.unlinkIdentity(identity);
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disconnect.");
    } finally {
      setProviderBusy(null);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  const emailIdentity = (user.identities ?? []).find((i) => i.provider === "email");

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <Link
            to="/app"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            <span>Back to agent</span>
          </Link>
          <Link to="/" className="flex items-center gap-2">
            <Logo className="size-6" />
            <span className="hidden sm:inline font-medium tracking-tight text-[15px]">Discoverse</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-10">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Profile settings</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Update how you appear in the agent and manage how you sign in.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-sm text-foreground/80 bg-muted/60 border border-border rounded-lg px-3 py-2.5">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Profile */}
          <section className="space-y-4">
            <header>
              <h2 className="text-sm font-mono uppercase tracking-[0.18em] text-muted-foreground">
                Profile
              </h2>
            </header>

            <form onSubmit={saveName} className="space-y-3 border border-border rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-3 pb-3 border-b border-border">
                <span className="size-10 rounded-full bg-foreground text-background inline-flex items-center justify-center text-sm font-medium">
                  {(name || user.email || "?")[0]?.toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{name || user.email}</p>
                  <p className="text-xs text-muted-foreground truncate inline-flex items-center gap-1.5">
                    <Mail className="size-3" />
                    {user.email}
                  </p>
                </div>
              </div>

              <label className="block">
                <span className="block text-sm font-medium mb-1.5">Display name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  maxLength={80}
                  className="w-full px-3 py-2.5 text-sm bg-background border border-border rounded-xl outline-none focus:border-foreground/40 transition-colors"
                />
                <span className="mt-1.5 block text-xs text-muted-foreground">
                  Shown in chat metadata and shared traces.
                </span>
              </label>

              <div className="flex items-center justify-end gap-3">
                {nameOk && (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3.5" />
                    Saved
                  </span>
                )}
                <button
                  type="submit"
                  disabled={savingName}
                  className="inline-flex items-center gap-2 rounded-xl bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {savingName && <Loader2 className="size-3.5 animate-spin" />}
                  Save
                </button>
              </div>
            </form>
          </section>

          {/* Connected providers */}
          <section className="space-y-4">
            <header>
              <h2 className="text-sm font-mono uppercase tracking-[0.18em] text-muted-foreground">
                Sign-in methods
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Connect or disconnect providers. You always need at least one way to sign in.
              </p>
            </header>

            <div className="border border-border rounded-2xl divide-y divide-border overflow-hidden">
              {/* Email row (always present if email identity exists) */}
              <div className="flex items-center gap-3 p-4">
                <div className="size-9 rounded-lg bg-muted inline-flex items-center justify-center shrink-0">
                  <Mail className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Email & password</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {emailIdentity ? user.email : "Not connected"}
                  </p>
                </div>
                {emailIdentity ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono uppercase tracking-[0.14em]">
                    <Check className="size-3" />
                    Connected
                  </span>
                ) : (
                  <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
                    —
                  </span>
                )}
              </div>

              {PROVIDERS.map((p) => {
                const linked = linkedIds.has(p.id);
                const busy = providerBusy === p.id;
                const canUnlink = linked && (user.identities ?? []).length > 1;
                return (
                  <div key={p.id} className="flex items-center gap-3 p-4">
                    <div className="size-9 rounded-lg bg-muted inline-flex items-center justify-center shrink-0">
                      {p.mark}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{p.label}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </div>
                    {linked ? (
                      <button
                        onClick={() => unlinkProvider(p.id)}
                        disabled={busy || !canUnlink}
                        title={canUnlink ? "Disconnect" : "Cannot disconnect your only sign-in method"}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Unlink className="size-3.5" />}
                        Disconnect
                      </button>
                    ) : (
                      <button
                        onClick={() => linkProvider(p.id)}
                        disabled={busy}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-foreground text-background px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                        Connect
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Session */}
          <section className="space-y-4">
            <header>
              <h2 className="text-sm font-mono uppercase tracking-[0.18em] text-muted-foreground">
                Session
              </h2>
            </header>
            <div className="border border-border rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Sign out of this device</p>
                <p className="text-xs text-muted-foreground">You'll need to sign in again to use the agent.</p>
              </div>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/auth" });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                <LogOut className="size-3.5" />
                Sign out
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-4" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.5 29.3 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.5 29.3 4.5 24 4.5c-7.5 0-14 4.3-17.7 10.2z"/>
      <path fill="#4CAF50" d="M24 43.5c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.9 39.2 16.4 43.5 24 43.5z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.6l6.2 5.2C41.4 36 43.5 30.5 43.5 24c0-1.2-.1-2.3-.4-3.5z"/>
    </svg>
  );
}
