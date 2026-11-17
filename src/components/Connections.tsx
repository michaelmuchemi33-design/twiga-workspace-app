import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const items = [
  { key: "calendar", title: "Google Calendar", detail: "Read and create appointments.", action: "calendar.list" },
  { key: "contacts", title: "Google Contacts", detail: "Look up customer and staff contacts.", action: "contacts.list" },
  { key: "sheets", title: "Google Sheets", detail: "Create and update business records.", action: "sheets.ensure" },
  { key: "drive", title: "Google Drive", detail: "Access files created or selected for TWIGA.", action: "drive.list" },
];

function loadGoogleIdentity() {
  return new Promise<void>((resolve, reject) => {
    const w = window as any;
    if (w.google?.accounts?.oauth2) return resolve();
    let script = document.getElementById("twiga-google-identity") as HTMLScriptElement | null;
    if (script) { script.addEventListener("load", () => resolve(), { once: true }); script.addEventListener("error", () => reject(new Error("Google sign-in could not load.")), { once: true }); return; }
    script = document.createElement("script"); script.id = "twiga-google-identity"; script.src = "https://accounts.google.com/gsi/client"; script.async = true; script.defer = true;
    script.onload = () => resolve(); script.onerror = () => reject(new Error("Google sign-in could not load.")); document.head.appendChild(script);
  });
}

export default function Connections({ businessId, demo = false, googleAuth }: { businessId: string; demo?: boolean; googleAuth?: { tokens?: { accessToken: string; refreshToken?: string } | null } }) {
  const [status, setStatus] = useState<any>({ connected: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tests, setTests] = useState<Record<string, string>>({});
  const [oauthConfig, setOauthConfig] = useState<any>({ serverConfigured: false });
  const [sautikitConfig, setSautikitConfig] = useState<any>({});
  const [xaiConfig, setXaiConfig] = useState<any>({});
  const [googleSecretConfig, setGoogleSecretConfig] = useState<any>({});
  const [googleClientIdInput, setGoogleClientIdInput] = useState("");
  const [googleClientSecretInput, setGoogleClientSecretInput] = useState("");
  const [sautikitKey, setSautikitKey] = useState("");
  const [xaiKey, setXaiKey] = useState("");
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerMessage, setProviderMessage] = useState("");
  const [grokTestMessage, setGrokTestMessage] = useState("");

  const action = useCallback(async (name: string, extra: Record<string, unknown> = {}) => {
    if (!supabase || !businessId) throw new Error("Choose a business workspace first.");
    const { data, error } = await supabase.functions.invoke("google-workspace", { body: { action: name, businessId, ...extra } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    return data;
  }, [businessId]);

  const refresh = useCallback(async () => {
    if (!businessId || !supabase) return;
    try {
      const [connection, oauth] = await Promise.all([action("status"), action("oauth.config")]);
      setStatus(connection); setOauthConfig(oauth);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Google status unavailable."); }
  }, [action, businessId]);

  const refreshProviders = useCallback(async () => {
    if (!businessId || !supabase) return;
    const [sautikit, xai, googleSecrets] = await Promise.allSettled([
      supabase.functions.invoke("twiga-sautikit", { body: { action: "get_config", businessId } }),
      supabase.functions.invoke("twiga-platform-secrets", { body: { action: "get_config" } }),
      supabase.functions.invoke("twiga-platform-secrets", { body: { action: "google.oauth.status" } }),
    ]);
    if (sautikit.status === "fulfilled" && !sautikit.value.error && !sautikit.value.data?.error) setSautikitConfig(sautikit.value.data || {});
    else setSautikitConfig({ isPlatformAdmin: false, providerError: sautikit.status === "rejected" ? String(sautikit.reason) : sautikit.value.error?.message });
    if (xai.status === "fulfilled" && !xai.value.error && !xai.value.data?.error) setXaiConfig(xai.value.data || {});
    else setXaiConfig({ isAdmin: false });
    if (googleSecrets.status === "fulfilled" && !googleSecrets.value.error && !googleSecrets.value.data?.error) setGoogleSecretConfig(googleSecrets.value.data || {});
    else setGoogleSecretConfig({ isAdmin: false });
  }, [businessId]);

  useEffect(() => { void refresh(); void refreshProviders(); }, [refresh, refreshProviders]);

  const connect = async () => {
    if (!businessId || !supabase) { setMessage("Create or select a business first."); return; }
    setBusy(true); setMessage("");
    try {
      if (googleAuth?.tokens?.accessToken) {
        const saved = await action("connect", { accessToken: googleAuth.tokens.accessToken, refreshToken: googleAuth.tokens.refreshToken });
        if (!saved.connected) throw new Error(saved.message || "Google did not grant all required permissions. Sign out and sign in with Google again to review the permissions.");
        setMessage("Google connected as " + (saved.googleEmail || "your account") + "."); await refresh(); return;
      }
      const cfg = await action("oauth.config");
      if (!cfg.clientId) throw new Error("Google OAuth client ID is missing from TWIGA server settings.");
      await loadGoogleIdentity();
      const client = (window as any).google.accounts.oauth2.initCodeClient({
        client_id: cfg.clientId, scope: (cfg.scopes || []).join(" "), ux_mode: "popup", access_type: "offline", prompt: "consent", include_granted_scopes: true,
        callback: async (result: any) => {
          if (result.error || !result.code) { setMessage(result.error_description || result.error || "Google permission was not completed."); setBusy(false); return; }
          try { const saved = await action("connect", { authorizationCode: result.code, redirectUri: "postmessage" }); if (!saved.connected) throw new Error(saved.message || "Google did not grant all requested permissions."); setMessage("Google connected as " + (saved.googleEmail || "your account") + "."); await refresh(); }
          catch (e) { setMessage(e instanceof Error ? e.message : "Google connection failed."); } finally { setBusy(false); }
        },
        error_callback: (e: any) => { setMessage(e?.message || "Google permission window closed."); setBusy(false); },
      });
      client.requestCode();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Google connection failed."); setBusy(false); }
  };

  const test = async (item: typeof items[number]) => {
    setBusy(true);
    try {
      const result = await action(item.action);
      const count = item.key === "calendar" ? (result.items || []).length : item.key === "contacts" ? (result.connections || []).length : item.key === "drive" ? (result.files || []).length : null;
      setTests(old => ({ ...old, [item.key]: count === null ? "Working · spreadsheet ready" : "Working · " + count + " records returned" }));
      if (result.spreadsheetUrl) setStatus((old: any) => ({ ...old, spreadsheetUrl: result.spreadsheetUrl }));
    } catch (e) { setTests(old => ({ ...old, [item.key]: "Needs attention · " + (e instanceof Error ? e.message : "Test failed") })); }
    finally { setBusy(false); }
  };

  const saveProviderKey = async (provider: "grok" | "sautikit") => {
    const apiKey = (provider === "grok" ? xaiKey : sautikitKey).trim();
    if (!apiKey || !supabase) { setProviderMessage("Paste the API key first."); return; }
    setProviderBusy(true); setProviderMessage(provider === "grok" ? "Validating the xAI key…" : "Validating the SautiKit key…");
    try {
      const functionName = provider === "grok" ? "twiga-platform-secrets" : "twiga-sautikit";
      const actionName = provider === "grok" ? "save_xai_key" : "connect";
      const { data, error } = await supabase.functions.invoke(functionName, { body: { action: actionName, apiKey } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      if (provider === "grok") setXaiKey(""); else setSautikitKey("");
      setProviderMessage(data?.message || (provider === "grok" ? "Grok key validated and saved in encrypted storage." : "SautiKit key validated and saved in encrypted storage."));
      await refreshProviders();
    } catch (e) { setProviderMessage(e instanceof Error ? e.message : "Could not save provider key."); }
    finally { setProviderBusy(false); }
  };

  const saveGoogleOAuth = async () => {
    if (!supabase) return;
    if (!googleClientIdInput.trim() || !googleClientSecretInput.trim()) { setProviderMessage("Enter both the Google OAuth Web Client ID and Client Secret."); return; }
    setProviderBusy(true); setProviderMessage("Saving Google OAuth credentials securely…");
    try {
      const { data, error } = await supabase.functions.invoke("twiga-platform-secrets", { body: { action: "google.oauth.save", clientId: googleClientIdInput.trim(), clientSecret: googleClientSecretInput.trim() } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setGoogleClientIdInput(""); setGoogleClientSecretInput("");
      setProviderMessage(data?.message || "Google OAuth credentials saved in encrypted Vault.");
      await Promise.all([refresh(), refreshProviders()]);
    } catch (e) { setProviderMessage(e instanceof Error ? e.message : "Could not save Google OAuth credentials."); }
    finally { setProviderBusy(false); }
  };

  const testGrok = async () => {
    if (!supabase) return;
    setProviderBusy(true); setGrokTestMessage("Testing the live Grok setup assistant…");
    try {
      const { data: authData } = await supabase.auth.getUser(); const user = authData?.user;
      const { data, error } = await supabase.functions.invoke("twiga-setup-assistant", { body: { messages: [{ role: "user", content: "Reply with one short sentence confirming that the TWIGA Grok setup assistant is responding." }], ownerProfile: { name: user?.user_metadata?.full_name || "TWIGA owner", email: user?.email || "" } } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setGrokTestMessage(data?.reply || "Grok responded successfully.");
    } catch (e) { setGrokTestMessage(e instanceof Error ? e.message : "Grok test failed."); }
    finally { setProviderBusy(false); }
  };

  if (demo) return <section className="rounded-2xl border border-neutral-200 bg-white p-6"><h1 className="text-2xl font-semibold">Connections & permissions</h1><p className="mt-2 text-sm text-neutral-500">Sign in to connect Google services for your business.</p></section>;

  const googleOAuthReady = !!oauthConfig.serverConfigured;
  return <div className="mx-auto max-w-5xl space-y-5">
    <header className="rounded-2xl border border-neutral-200 bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Workspace integrations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Connections & permissions</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">Connect Google services for each business and manage the TWIGA AI providers. API keys are validated on the server and stored in encrypted Supabase Vault, never in browser storage.</p>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{!oauthConfig.serverConfigured && !googleAuth?.tokens?.accessToken ? "Enter the Google OAuth Web Client ID and Client Secret below. TWIGA stores them in encrypted Supabase Vault and uses them for the business consent flow. Each business owner still authorizes their own Google account." : "Google Workspace permissions can be connected using your approved Google sign-in or the separate consent screen."}</div>
      <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm leading-6 text-neutral-700">
        <strong>Google sign-in domain check:</strong> if Google shows <code>400 origin_mismatch</code>, add <code>https://live.twiga.co.ke</code> and <code>https://app.twiga.co.ke</code> as Authorized JavaScript origins on the same Google OAuth Web client. Add this Authorized redirect URI: <code>https://ztyxxikkposfpxsutnfr.supabase.co/auth/v1/callback</code>. Do not add a path or wildcard to the JavaScript origins. <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="ml-1 font-semibold text-orange-700 underline">Open Google Cloud credentials ↗</a>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-800">{status.connected ? "Google connected" : "Google not connected"}</span>
        {status.googleEmail && <span className="text-sm text-neutral-600">{status.googleEmail}</span>}
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-700">{googleOAuthReady ? "OAuth credentials configured" : "Check OAuth configuration"}</span>
        <button onClick={connect} disabled={busy || !businessId} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Please wait…" : status.connected ? "Review / reconnect permissions" : "Connect Google account"}</button>
        <button onClick={() => { void refresh(); void refreshProviders(); }} disabled={busy || providerBusy || !businessId} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700">Refresh status</button>
      </div>
      {!businessId && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Create or select a business in AI Setup first.</p>}
    </header>
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Platform OAuth credentials</p><h2 className="mt-1 text-lg font-semibold text-neutral-950">Google OAuth Web Client</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-600">These are TWIGA's application credentials, not a customer's Google password. Save them once; each business owner separately approves Calendar, Contacts, Sheets and Drive access.</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${oauthConfig.serverConfigured ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-600"}`}>{oauthConfig.serverConfigured ? "OAuth ready" : "Credentials needed"}</span></div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-800">Google OAuth Client ID<input value={googleClientIdInput} onChange={e => setGoogleClientIdInput(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500" /></label>
        <label className="block text-sm font-medium text-neutral-800">Google OAuth Client Secret<input type="password" autoComplete="new-password" value={googleClientSecretInput} onChange={e => setGoogleClientSecretInput(e.target.value)} placeholder="Paste Google OAuth client secret" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500" /></label>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600"><span>Client ID: {googleSecretConfig.clientIdConfigured ? `saved ····${googleSecretConfig.clientIdLast4 || ""}` : "missing"}</span><span>Client Secret: {googleSecretConfig.clientSecretConfigured ? `saved ····${googleSecretConfig.clientSecretLast4 || ""}` : "missing"}</span><span>Token encryption: {googleSecretConfig.encryptionReady ? "ready" : "missing"}</span></div>
      <div className="mt-3 flex flex-wrap items-center gap-3"><button onClick={() => void saveGoogleOAuth()} disabled={providerBusy || !googleClientIdInput.trim() || !googleClientSecretInput.trim()} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Validate & save Google credentials</button><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-sm font-semibold text-orange-700 underline">Get Google OAuth credentials ↗</a></div>
      <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50/50 p-3 text-sm leading-6 text-neutral-700"><strong>Google sign-in is a separate setting.</strong> These Vault credentials power Calendar, Contacts, Sheets and Drive consent. To make the Google login button work, paste the same Client ID and Secret into <a href="https://supabase.com/dashboard/project/ztyxxikkposfpxsutnfr/auth/providers" target="_blank" rel="noreferrer" className="font-semibold text-orange-700 underline">Supabase Auth → Providers → Google ↗</a> as well. Add this authorized redirect URI in Google Cloud: <code className="break-all">https://ztyxxikkposfpxsutnfr.supabase.co/auth/v1/callback</code>.</div>
    </section>
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-neutral-950">Google permissions</h2><p className="mt-1 text-sm text-neutral-500">Approve access in Google. You can revoke it from your Google Account at any time.</p>
      <div className="mt-4 divide-y divide-neutral-100">
        {items.map(item => {
          const granted = (status.scopes || []).some((scope: string) => item.key === "calendar" ? scope.includes("calendar.events") : item.key === "contacts" ? scope.includes("contacts") : item.key === "sheets" ? scope.includes("spreadsheets") : scope.includes("drive.file"));
          return <div key={item.key} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold text-neutral-900">{item.title}</p><p className="mt-1 text-sm text-neutral-500">{item.detail}</p><p className="mt-1 text-xs font-medium text-neutral-600">{status.connected && granted ? "Permission granted" : "Permission not confirmed"}</p></div>
            <div className="flex flex-wrap items-center gap-2">{status.connected && <button onClick={() => test(item)} disabled={busy} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700">Test {item.title.replace("Google ", "")}</button>}{tests[item.key] && <span className="max-w-xs text-xs text-neutral-600">{tests[item.key]}</span>}</div>
          </div>;
        })}
      </div>
      {status.spreadsheetUrl && <a href={status.spreadsheetUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-orange-700 underline">Open business spreadsheet</a>}
    </section>
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Business setup assistant</p><h2 className="mt-1 text-lg font-semibold text-neutral-950">Grok · xAI</h2></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${xaiConfig.keyConfigured ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-600"}`}>{xaiConfig.keyConfigured ? "Connected" : xaiConfig.isAdmin ? "API key needed" : "Managed by TWIGA"}</span></div>
        <p className="mt-2 text-sm leading-6 text-neutral-600">Grok powers the real business onboarding assistant. The key is validated against xAI and stored in Supabase Vault; it is never exposed to customer browsers.</p>
        {xaiConfig.isAdmin ? <>
          {xaiConfig.keyConfigured && <p className="mt-2 text-xs text-neutral-500">Encrypted key saved{xaiConfig.keyLast4 ? ` · ending ${xaiConfig.keyLast4}` : ""}.</p>}
          <label className="mt-4 block text-sm font-medium text-neutral-800">{xaiConfig.keyConfigured ? "Replace Grok API key" : "Grok API key"}<input type="password" autoComplete="new-password" value={xaiKey} onChange={e => setXaiKey(e.target.value)} placeholder="Paste xAI API key" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500" /></label>
          <a href="https://console.x.ai/team/default/api-keys" target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-orange-700 underline">Get a Grok API key ↗</a>
          <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void saveProviderKey("grok")} disabled={providerBusy || !xaiKey.trim()} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Validate & save Grok key</button>{xaiConfig.keyConfigured && <button onClick={() => void testGrok()} disabled={providerBusy} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-40">Test Grok</button>}</div>
          {grokTestMessage && <p role="status" className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{grokTestMessage}</p>}
        </> : <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">Only the TWIGA platform administrator can manage this shared API key.</p>}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">AI phone provider</p><h2 className="mt-1 text-lg font-semibold text-neutral-950">SautiKit</h2></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${sautikitConfig.keyConfigured ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-600"}`}>{sautikitConfig.keyConfigured ? "Connected" : "API key needed"}</span></div>
        <p className="mt-2 text-sm leading-6 text-neutral-600">SautiKit powers the proven female voice, male voice options, inbound agent and outbound customer calls. Voice selection and call scheduling are in Phone & AI.</p>
        {sautikitConfig.phoneLine?.line_number && <p className="mt-2 text-sm font-semibold text-neutral-900">Assigned AI line: {sautikitConfig.phoneLine.line_number}</p>}
        {sautikitConfig.isPlatformAdmin ? <>
          {sautikitConfig.keyConfigured && <p className="mt-2 text-xs text-neutral-500">Encrypted API key saved{sautikitConfig.keyLast4 ? ` · ending ${sautikitConfig.keyLast4}` : ""}.</p>}
          <label className="mt-4 block text-sm font-medium text-neutral-800">{sautikitConfig.keyConfigured ? "Replace SautiKit API key" : "SautiKit API key"}<input type="password" autoComplete="new-password" value={sautikitKey} onChange={e => setSautikitKey(e.target.value)} placeholder="Paste SautiKit API key" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500" /></label>
          <p className="mt-2 text-xs text-neutral-500">Use the key from your existing SautiKit account. It is validated and stored securely when connected.</p>
          <a href="https://app.sautikit.com/developers/api-keys" target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-orange-700 underline">Get a SautiKit API key ↗</a>
          <button onClick={() => void saveProviderKey("sautikit")} disabled={providerBusy || !sautikitKey.trim()} className="mt-3 rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Validate & save SautiKit key</button>
        </> : <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">The provider key is managed centrally by TWIGA. Your business line and voice settings remain separate.</p>}
      </div>
    </section>
    {providerMessage && <p role="status" className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">{providerMessage}</p>}
    {message && <p role="status" className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">{message}</p>}
  </div>;
}
