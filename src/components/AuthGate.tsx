import { FormEvent, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

export default function AuthGate({ children }: { children: (session: Session) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let mounted = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (authError) throw authError;
        if (data.session) setSession(data.session);
        else setNotice("Check your email to confirm your TWIGA account, then sign in here.");
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        setSession(data.session);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to sign in. Please try again."); }
    finally { setBusy(false); }
  };

  const google = async () => {
    if (!supabase) return;
    setBusy(true); setError("");
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { access_type: "offline", prompt: "select_account" } },
    });
    if (authError) { setError(authError.message); setBusy(false); }
  };

  if (loading) return <div className="grid min-h-screen place-items-center bg-neutral-50 text-sm text-neutral-500">Loading secure workspace…</div>;
  if (session) return <>{children(session)}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f6f6f5] px-4 py-10">
      <section className="w-full max-w-md overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_24px_80px_-35px_rgba(0,0,0,.25)]">
        <div className="bg-neutral-950 px-8 py-8 text-white">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500 text-xl font-black">T</div>
          <p className="text-xs font-bold uppercase tracking-[.22em] text-orange-400">TWIGA BUSINESS</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Your workspace, ready when you are.</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-400">Sign in to manage your business calls, customers, bookings, orders and follow-ups.</p>
        </div>
        <div className="p-8">
          {!hasSupabaseConfig ? (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
              <strong>Workspace connection is not configured.</strong>
              <p className="mt-1">The deployment needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY before customers can sign in.</p>
            </div>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-2 rounded-xl bg-neutral-100 p-1 text-sm font-semibold">
                <button onClick={() => { setMode("signin"); setError(""); setNotice(""); }} className={`rounded-lg py-2.5 ${mode === "signin" ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"}`}>Sign in</button>
                <button onClick={() => { setMode("signup"); setError(""); setNotice(""); }} className={`rounded-lg py-2.5 ${mode === "signup" ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-500"}`}>Create account</button>
              </div>
              <button onClick={google} disabled={busy} className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-50">
                <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.91c-.58 2.96-2.27 5.46-4.77 7.15l7.73 6C44.37 38.03 46.98 31.88 46.98 24.55z"/><path fill="#FBBC05" d="M10.54 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.98-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.83l-7.73-6c-2.14 1.44-4.88 2.3-8.17 2.3-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
                Continue with Google
              </button>
              <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-neutral-400"><span className="h-px flex-1 bg-neutral-200"/>or use email<span className="h-px flex-1 bg-neutral-200"/></div>
              <form onSubmit={submit} className="space-y-4">
                {mode === "signup" && <label className="block text-sm font-medium text-neutral-700">Your name<input required value={name} onChange={e=>setName(e.target.value)} autoComplete="name" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Full name"/></label>}
                <label className="block text-sm font-medium text-neutral-700">Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="you@business.co.ke"/></label>
                <label className="block text-sm font-medium text-neutral-700">Password<input type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="At least 8 characters"/></label>
                {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                {notice && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
                <button disabled={busy} className="h-12 w-full rounded-xl bg-orange-500 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-50">{busy ? "Please wait…" : mode === "signup" ? "Create my workspace" : "Sign in to TWIGA"}</button>
              </form>
            </>
          )}
          <p className="mt-6 text-center text-xs leading-5 text-neutral-400">Your live workspace is private to your account. Demo records are kept separate.</p>
          <a href="https://twiga.co.ke" className="mt-4 block text-center text-xs font-semibold text-neutral-500 hover:text-orange-600">← Back to TWIGA website</a>
        </div>
      </section>
    </main>
  );
}
