import { FormEvent, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

export type GoogleAuthContext = {
  isGoogleUser: boolean;
  tokens: { accessToken: string; refreshToken?: string } | null;
  profile: { fullName: string; email: string; avatarUrl: string };
};

type EnrichedSession = Session & { provider_token?: string; provider_refresh_token?: string };

function authContext(session: Session | null): GoogleAuthContext {
  if (!session) return { isGoogleUser: false, tokens: null, profile: { fullName: "", email: "", avatarUrl: "" } };
  const user = session.user;
  const metadata = user.user_metadata || {};
  const identities = user.identities || [];
  const isGoogleUser = user.app_metadata?.provider === "google" || identities.some((identity) => identity.provider === "google");
  const enriched = session as EnrichedSession;
  return {
    isGoogleUser,
    tokens: isGoogleUser && enriched.provider_token
      ? { accessToken: enriched.provider_token, ...(enriched.provider_refresh_token ? { refreshToken: enriched.provider_refresh_token } : {}) }
      : null,
    profile: {
      fullName: String(metadata.full_name || metadata.name || [metadata.given_name, metadata.family_name].filter(Boolean).join(" ") || ""),
      email: String(user.email || metadata.email || ""),
      avatarUrl: String(metadata.avatar_url || metadata.picture || metadata.photo_url || ""),
    },
  };
}

const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events.owned",
  "https://www.googleapis.com/auth/contacts.readonly",
].join(" ");

export default function AuthGate({ children }: {
  children: (session: Session, googleAuth: GoogleAuthContext) => ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [googleAuth, setGoogleAuth] = useState<GoogleAuthContext>(authContext(null));
  const [loading, setLoading] = useState(true);
  const [emailMode, setEmailMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let mounted = true;
    const applySession = (nextSession: Session | null) => {
      if (!mounted) return;
      setSession(nextSession);
      setGoogleAuth(authContext(nextSession));
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) setError(sessionError.message);
      applySession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => applySession(nextSession));
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const google = async () => {
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/auth/callback",
        scopes: GOOGLE_SCOPES,
        queryParams: {
          access_type: "offline",
          prompt: "consent select_account",
          include_granted_scopes: "true",
        },
      },
    });
    if (authError) { setError(authError.message); setBusy(false); }
  };

  const emailSignIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
      setSession(data.session);
      setGoogleAuth(authContext(data.session));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return (
    <div className="grid min-h-screen place-items-center bg-[#f6f6f5] text-sm text-neutral-500">
      <div className="flex items-center gap-3"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-orange-500" />Opening your private TWIGA workspace…</div>
    </div>
  );
  if (session) return <>{children(session, googleAuth)}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f4f1] px-4 py-10">
      <section className="w-full max-w-[510px] overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_24px_80px_-35px_rgba(0,0,0,.25)]">
        <div className="bg-[#171715] px-7 py-8 text-white sm:px-10 sm:py-10">
          <div className="mb-7 flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-white p-1.5">
              <img src="https://app.twiga.co.ke/twiga-mark.webp" alt="TWIGA" className="h-full w-full object-contain" referrerPolicy="no-referrer" />
            </div>
            <div><p className="text-lg font-black tracking-[.16em]">TWIGA</p><p className="mt-0.5 text-[10px] font-semibold tracking-[.2em] text-neutral-400">BUSINESS WORKSPACE</p></div>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-orange-400">ONE ACCOUNT · ONE WORKSPACE</p>
          <h1 className="mt-3 text-[32px] font-bold leading-[1.12] tracking-tight sm:text-[38px]">Start with Google.<br/>Go straight to work.</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-neutral-300">Use your Google account to create or open your private TWIGA dashboard. No separate registration form or new password.</p>
        </div>
        <div className="p-7 sm:p-10">
          {!hasSupabaseConfig ? (
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
              <strong>Workspace connection is not configured.</strong>
              <p className="mt-1">The deployment needs its Supabase URL and publishable key before users can sign in.</p>
            </div>
          ) : (
            <>
              <button onClick={google} disabled={busy} className="flex h-14 w-full items-center justify-center gap-3 rounded-xl bg-orange-500 px-4 text-sm font-bold text-neutral-950 transition hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60">
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#fff" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-15z"/><path fill="#fff" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.6-5.1c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8V33C9.2 39.6 16.1 44 24 44z"/><path fill="#fff" d="M12.6 27.7a12 12 0 0 1 0-7.4v-5.4H5.8a20 20 0 0 0 0 18.2z"/><path fill="#fff" d="M24 11.9c3 0 5.7 1 7.8 3.1l5.8-5.8C34.1 5.9 29.5 4 24 4 16.1 4 9.2 8.4 5.8 14.9l6.8 5.4c1.6-4.8 6.1-8.4 11.4-8.4z"/></svg>
                {busy ? "Opening Google…" : "Continue with Google"}
              </button>
              <div className="mt-6 rounded-2xl border border-neutral-200 bg-[#faf9f7] p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-700">What Google shares after you approve</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-orange-600">◎</span><div><p className="text-xs font-semibold text-neutral-900">Name and email</p><p className="text-[11px] text-neutral-500">Your Google account identity</p></div></div>
                  <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-orange-600">◉</span><div><p className="text-xs font-semibold text-neutral-900">Profile picture</p><p className="text-[11px] text-neutral-500">Shown in your dashboard</p></div></div>
                  <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-orange-600">▦</span><div><p className="text-xs font-semibold text-neutral-900">Google Calendar</p><p className="text-[11px] text-neutral-500">Read and manage your events</p></div></div>
                  <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-orange-600">♧</span><div><p className="text-xs font-semibold text-neutral-900">Google Contacts</p><p className="text-[11px] text-neutral-500">Read contacts you approve</p></div></div>
                </div>
              </div>
              <p className="mt-4 text-center text-[11px] leading-5 text-neutral-500">Calendar and Contacts are requested on Google's permission screen. TWIGA only receives the access you approve. You can disconnect Google later in Profile.</p>
              {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <div className="mt-6 border-t border-neutral-100 pt-5 text-center">
                <button onClick={() => { setEmailMode((v) => !v); setError(""); }} className="text-xs font-semibold text-neutral-500 underline decoration-neutral-300 underline-offset-4 hover:text-orange-700">
                  {emailMode ? "Back to Google sign-in" : "Use email instead (existing accounts)"}
                </button>
              </div>
              {emailMode && (
                <form onSubmit={emailSignIn} className="mt-5 space-y-3 rounded-2xl border border-neutral-200 p-4">
                  <p className="text-xs font-semibold text-neutral-700">Sign in to an existing TWIGA account</p>
                  <label className="block text-xs font-semibold text-neutral-700">Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="you@business.co.ke"/></label>
                  <label className="block text-xs font-semibold text-neutral-700">Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Your existing password"/></label>
                  <button disabled={busy} className="h-11 w-full rounded-xl bg-neutral-950 text-sm font-bold text-white disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button>
                </form>
              )}
            </>
          )}
          <p className="mt-6 text-center text-[11px] leading-5 text-neutral-400">By continuing, you agree to the <a className="underline underline-offset-2" href="https://twiga.co.ke/privacy" target="_blank" rel="noopener">Privacy Policy</a> and <a className="underline underline-offset-2" href="https://twiga.co.ke/terms" target="_blank" rel="noopener">Terms</a>.</p>
          <a href="https://twiga.co.ke" className="mt-3 block text-center text-xs font-semibold text-neutral-500 hover:text-orange-600">← Back to TWIGA website</a>
        </div>
      </section>
    </main>
  );
}
