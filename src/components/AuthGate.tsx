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

// Authentication requests identity only. Business data permissions are requested
// later, deliberately, from Connections so Google verification for those APIs
// cannot block a new customer from creating a TWIGA account.
const GOOGLE_SCOPES = "openid email profile";

export default function AuthGate({ children }: {
  children: (session: Session, googleAuth: GoogleAuthContext) => ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [googleAuth, setGoogleAuth] = useState<GoogleAuthContext>(authContext(null));
  const [loading, setLoading] = useState(true);
  const [emailMode, setEmailMode] = useState(false);
  const [emailAction, setEmailAction] = useState<"signin" | "signup">("signin");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [recoveryConfirmation, setRecoveryConfirmation] = useState("");
  const [recoverySuccess, setRecoverySuccess] = useState(false);
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
    // Subscribe before reading persisted state so a fast OAuth callback or
    // sign-out event cannot be overwritten by a late getSession() response.
    let authEventReceived = false;
    const hasRecoveryType = () => {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      return query.get("type") === "recovery" || hash.get("type") === "recovery";
    };
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authEventReceived = true;
      applySession(nextSession);
      if (event === "PASSWORD_RECOVERY" || (event === "INITIAL_SESSION" && hasRecoveryType())) {
        setRecoveryMode(true);
        setRecoverySuccess(false);
        setError("");
        setNotice("");
      }
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted || authEventReceived) return;
      if (sessionError) setError(sessionError.message);
      if (hasRecoveryType()) setRecoveryMode(true);
      applySession(data.session);
    }).catch((cause) => {
      if (!mounted) return;
      setError(cause instanceof Error ? cause.message : "Could not restore your TWIGA session.");
      setLoading(false);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  const google = async () => {
    if (!supabase) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
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
    if (authError) throw authError;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google sign-in could not be started. Please try again.");
      setBusy(false);
    }
  };

  const requestPasswordReset = async () => {
    if (!supabase) return;
    if (!email.trim()) {
      setError("Enter the email address for your TWIGA account first.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        // Keep the same origin so the PKCE verifier created by Supabase remains available.
        redirectTo: window.location.origin + "/auth/callback",
      });
      if (resetError) throw resetError;
      setNotice("If an account exists for this email, a reset link has been sent. Open it in this same browser to set your new password.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The password reset email could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  const completePasswordRecovery = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !session) {
      setError("This reset link could not be verified. Request a new password reset email and open it in the same browser.");
      return;
    }
    if (recoveryPassword.length < 8) {
      setError("Your new password must contain at least 8 characters.");
      return;
    }
    if (recoveryPassword !== recoveryConfirmation) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: recoveryPassword });
      if (updateError) throw updateError;
      setRecoveryPassword("");
      setRecoveryConfirmation("");
      setRecoverySuccess(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your password could not be updated. Request a fresh reset link and try again.");
    } finally {
      setBusy(false);
    }
  };

  const returnToWorkspace = () => {
    setRecoveryMode(false);
    setRecoverySuccess(false);
    setError("");
    setNotice("");
    setPassword("");
  };

  const emailSignIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (emailAction === "signup") {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin + "/auth/callback",
            data: { full_name: fullName.trim(), name: fullName.trim() },
          },
        });
        if (authError) throw authError;
        if (data.session) {
          setSession(data.session);
          setGoogleAuth(authContext(data.session));
        } else {
          setNotice("Your account has been created. Check your email and confirm your address before signing in.");
        }
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        setSession(data.session);
        setGoogleAuth(authContext(data.session));
      }
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
  if (recoveryMode) return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f4f1] px-4 py-10">
      <section className="w-full max-w-[480px] overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_24px_80px_-35px_rgba(0,0,0,.25)]">
        <div className="bg-[#171715] px-7 py-8 text-white sm:px-10">
          <p className="text-xs font-bold tracking-[.2em] text-orange-400">TWIGA ACCOUNT SECURITY</p>
          <h1 className="mt-3 text-3xl font-bold text-white">{recoverySuccess ? "Password updated" : "Set a new password"}</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-300">
            {recoverySuccess
              ? "Your TWIGA password has been changed successfully."
              : "Choose a new password for your TWIGA account. This will replace your old password."}
          </p>
        </div>
        <div className="space-y-4 p-7 sm:p-10">
          {recoverySuccess ? (
            <>
              <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                Your password is saved. You can now continue to your private workspace.
              </div>
              <button type="button" onClick={returnToWorkspace} className="h-12 w-full rounded-xl bg-orange-500 px-4 text-sm font-bold text-neutral-950 hover:bg-orange-600">
                Continue to TWIGA
              </button>
            </>
          ) : session ? (
            <form onSubmit={completePasswordRecovery} className="space-y-4">
              <label className="block text-sm font-semibold text-neutral-700">
                New password
                <input type="password" value={recoveryPassword} onChange={e => setRecoveryPassword(e.target.value)} minLength={8} required autoComplete="new-password" className="mt-1.5 h-12 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="At least 8 characters"/>
              </label>
              <label className="block text-sm font-semibold text-neutral-700">
                Confirm new password
                <input type="password" value={recoveryConfirmation} onChange={e => setRecoveryConfirmation(e.target.value)} minLength={8} required autoComplete="new-password" className="mt-1.5 h-12 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Enter the new password again"/>
              </label>
              <p className="text-xs text-neutral-500">Use at least 8 characters. Your password is sent directly to Supabase Auth over HTTPS and is not stored by TWIGA.</p>
              {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <button type="submit" disabled={busy} className="h-12 w-full rounded-xl bg-orange-500 px-4 text-sm font-bold text-neutral-950 hover:bg-orange-600 disabled:opacity-60">
                {busy ? "Saving new password…" : "Save new password"}
              </button>
            </form>
          ) : (
            <div role="alert" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
              This reset link could not be verified or has expired. Return to sign in and request another email, then open the newest link in the same browser where you requested it.
            </div>
          )}
          {!recoverySuccess && (
            <button type="button" onClick={() => { setRecoveryMode(false); setEmailMode(true); setEmailAction("signin"); setError(""); setNotice(""); }} className="w-full text-center text-sm font-semibold text-neutral-600 underline underline-offset-4">
              Back to sign in
            </button>
          )}
        </div>
      </section>
    </main>
  );

  if (session) return <>{children(session, googleAuth)}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f4f1] px-4 py-10">
      <section className="w-full max-w-[510px] overflow-hidden rounded-[28px] border border-neutral-200 bg-white shadow-[0_24px_80px_-35px_rgba(0,0,0,.25)]">
        <div className="bg-[#171715] px-7 py-8 text-white sm:px-10 sm:py-10">
          <div className="mb-7 flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/15 bg-white/10 text-2xl font-black tracking-tight text-orange-400">T</div>
            <div><p className="text-lg font-black tracking-[.16em] text-white">TWIGA</p><p className="mt-0.5 text-[10px] font-semibold tracking-[.2em] text-neutral-300">BUSINESS WORKSPACE</p></div>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-orange-400">ONE ACCOUNT · ONE WORKSPACE</p>
          <h1 style={{ color: "#ffffff" }} className="mt-3 text-[32px] font-bold leading-[1.12] tracking-tight !text-white sm:text-[38px]">Your business.<br/>One private workspace.</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-neutral-300">Sign in securely with Google. Calendar, Contacts, Sheets and Drive are optional connections you can approve later from your workspace.</p>
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
                  <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-orange-600">▦</span><div><p className="text-xs font-semibold text-neutral-900">Google Calendar</p><p className="text-[11px] text-neutral-500">Connect later from your workspace</p></div></div>
                  <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-orange-600">♧</span><div><p className="text-xs font-semibold text-neutral-900">Google Contacts</p><p className="text-[11px] text-neutral-500">Connect later from your workspace</p></div></div>
                  <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-orange-600">▤</span><div><p className="text-xs font-semibold text-neutral-900">Google Sheets</p><p className="text-[11px] text-neutral-500">Connect later from your workspace</p></div></div>
                  <div className="flex items-center gap-2.5"><span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-orange-600">▣</span><div><p className="text-xs font-semibold text-neutral-900">Google Drive</p><p className="text-[11px] text-neutral-500">Connect later from your workspace</p></div></div>
                </div>
              </div>
              <p className="mt-4 text-center text-[11px] leading-5 text-neutral-500">Your Google account is used only to sign in here. You can separately connect Calendar, Contacts, Sheets and Drive later in Connections, and disconnect them whenever you choose.</p>
              {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <div className="mt-6 border-t border-neutral-100 pt-5 text-center">
                <p className="text-sm font-semibold text-neutral-800">New to TWIGA?</p>
                <button onClick={() => { setEmailMode(true); setEmailAction("signup"); setError(""); setNotice(""); }} className="mt-1 text-sm font-bold text-orange-700 underline decoration-orange-300 underline-offset-4 hover:text-orange-800">Create your account</button>
                <p className="mt-4 text-xs text-neutral-500">Already have an account? <button onClick={() => { setEmailMode(true); setEmailAction("signin"); setError(""); setNotice(""); }} className="font-bold text-neutral-900 underline underline-offset-4">Sign in with email</button></p>
                <button onClick={() => { setEmailMode(true); setEmailAction("signin"); setError(""); setNotice(""); }} className="mt-3 text-xs font-bold text-orange-700 underline underline-offset-4">Forgot password?</button>
                {emailMode && <button onClick={() => { setEmailMode(false); setError(""); }} className="mt-3 text-xs font-semibold text-neutral-500 underline underline-offset-4">Back to Google sign-in</button>}
              </div>
              {notice && <p role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
              {emailMode && (
                <form onSubmit={emailSignIn} className="mt-5 space-y-3 rounded-2xl border border-neutral-200 p-4">
                  <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-neutral-700">{emailAction === "signup" ? "Create your TWIGA account" : "Sign in to your TWIGA account"}</p><button type="button" onClick={() => { setEmailAction((mode) => mode === "signin" ? "signup" : "signin"); setError(""); setNotice(""); }} className="text-xs font-semibold text-orange-700 underline underline-offset-2">{emailAction === "signup" ? "I already have an account" : "Create new account"}</button></div>
                  {emailAction === "signup" && <label className="block text-xs font-semibold text-neutral-700">Your name<input type="text" required value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name" maxLength={100} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="Your full name"/></label>}
                  <label className="block text-xs font-semibold text-neutral-700">Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder="you@business.co.ke"/></label>
                  <label className="block text-xs font-semibold text-neutral-700">Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete={emailAction === "signup" ? "new-password" : "current-password"} minLength={8} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" placeholder={emailAction === "signup" ? "At least 8 characters" : "Your password"}/></label>
                  {emailAction === "signin" && <button type="button" onClick={requestPasswordReset} disabled={busy} className="w-full text-right text-xs font-bold text-orange-700 underline underline-offset-4 disabled:opacity-50">Forgot password?</button>}
                  <button disabled={busy} className="h-11 w-full rounded-xl bg-neutral-950 text-sm font-bold text-white disabled:opacity-50">{busy ? (emailAction === "signup" ? "Creating account…" : "Signing in…") : (emailAction === "signup" ? "Create account" : "Sign in")}</button>
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
