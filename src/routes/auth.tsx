import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Loader2, Mail, Lock, AlertCircle } from "lucide-react";
import { supabase } from "../integrations/supabase/client";
import { lovable } from "../integrations/lovable";
import { useAuth } from "../hooks/use-auth";
import { Logo } from "../components/site/Logo";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — Discoverse Agent" },
      { name: "description", content: "Sign in or create an account to use the Discoverse autonomous agent." },
    ],
  }),
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) navigate({ to: "/app" });
  }, [user, authLoading, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/app` : undefined;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        setInfo("Check your inbox to confirm your email, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/app" });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setInfo(null);
    setGoogleBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: typeof window !== "undefined" ? `${window.location.origin}/app` : undefined,
      });
      if (result.error) throw result.error;
      // If popup-based, session is set; navigate to /app.
      if (!result.redirected) navigate({ to: "/app" });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Google sign-in failed.");
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="size-4" />
            <span>Home</span>
          </Link>
          <Link to="/" className="flex items-center gap-2">
            <Logo className="size-6" />
            <span className="font-medium tracking-tight text-[15px]">Discoverse</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Sign in to continue to your agent."
                : "Start building with the Discoverse agent."}
            </p>
          </div>

          <button
            type="button"
            onClick={onGoogle}
            disabled={googleBusy || busy}
            className="w-full inline-flex items-center justify-center gap-3 rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium hover:bg-muted active:bg-muted disabled:opacity-60 transition-colors"
          >
            {googleBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <GoogleMark />
            )}
            <span>Continue with Google</span>
          </button>

          <div className="my-5 flex items-center gap-3 text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
            <span className="flex-1 h-px bg-border" />
            or
            <span className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block">
              <span className="sr-only">Email</span>
              <div className="relative">
                <Mail className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-3 py-3 text-sm bg-background border border-border rounded-xl outline-none focus:border-foreground/40 transition-colors"
                  required
                />
              </div>
            </label>
            <label className="block">
              <span className="sr-only">Password</span>
              <div className="relative">
                <Lock className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signin" ? "Your password" : "At least 6 characters"}
                  minLength={6}
                  className="w-full pl-10 pr-3 py-3 text-sm bg-background border border-border rounded-xl outline-none focus:border-foreground/40 transition-colors"
                  required
                />
              </div>
            </label>

            {error && (
              <div className="flex items-start gap-2 text-xs text-foreground/80 bg-muted/60 border border-border rounded-lg px-3 py-2">
                <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {info && (
              <div className="text-xs text-foreground/80 bg-muted/60 border border-border rounded-lg px-3 py-2">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || googleBusy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-foreground text-background px-4 py-3 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setInfo(null);
              }}
              className="text-foreground font-medium hover:underline underline-offset-4"
            >
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </p>
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
