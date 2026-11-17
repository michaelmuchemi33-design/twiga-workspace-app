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
  const [openrouterConfig, setXaiConfig] = useState<any>({});
  const [googleSecretConfig, setGoogleSecretConfig] = useState<any>({});
  const [googleClientIdInput, setGoogleClientIdInput] = useState("");
  const [googleClientSecretInput, setGoogleClientSecretInput] = useState("");
  const [sautikitKey, setSautikitKey] = useState("");
  const [openrouterKey, setXaiKey] = useState("");
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerMessage, setProviderMessage] = useState("");
  const [openrouterTestMessage, setOpenRouterTestMessage] = useState("");
  const [smsConfig, setSmsConfig] = useState<any>({ connected: false });
  const [smsClientId, setSmsClientId] = useState("");
  const [smsClientSecret, setSmsClientSecret] = useState("");
  const [smsSenderName, setSmsSenderName] = useState("");
  const [smsOrderEnabled, setSmsOrderEnabled] = useState(false);
  const [smsPaymentEnabled, setSmsPaymentEnabled] = useState(false);
  const [smsTestTo, setSmsTestTo] = useState("");
  const [smsTestMessage, setSmsTestMessage] = useState("TWIGA test message. Your business SMS connection is working.");
  const [smsMessage, setSmsMessage] = useState("");

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
    const [sautikit, openrouter, googleSecrets, sms] = await Promise.allSettled([
      supabase.functions.invoke("twiga-sautikit", { body: { action: "get_config", businessId } }),
      supabase.functions.invoke("twiga-platform-secrets", { body: { action: "get_config" } }),
      supabase.functions.invoke("twiga-platform-secrets", { body: { action: "google.oauth.status" } }),
      supabase.functions.invoke("twiga-kimisms", { body: { action: "get_config", businessId } }),
    ]);
    if (sautikit.status === "fulfilled" && !sautikit.value.error && !sautikit.value.data?.error) setSautikitConfig(sautikit.value.data || {});
    else setSautikitConfig({ isPlatformAdmin: false, providerError: sautikit.status === "rejected" ? String(sautikit.reason) : sautikit.value.error?.message });
    if (openrouter.status === "fulfilled" && !openrouter.value.error && !openrouter.value.data?.error) setXaiConfig(openrouter.value.data || {});
    else setXaiConfig({ isAdmin: false });
    if (googleSecrets.status === "fulfilled" && !googleSecrets.value.error && !googleSecrets.value.data?.error) setGoogleSecretConfig(googleSecrets.value.data || {});
    else setGoogleSecretConfig({ isAdmin: false });
    if (sms.status === "fulfilled" && !sms.value.error && !sms.value.data?.error) {
      setSmsConfig(sms.value.data || { connected: false });
      setSmsSenderName(String(sms.value.data?.senderName || ""));
      setSmsOrderEnabled(sms.value.data?.orderConfirmationEnabled === true);
      setSmsPaymentEnabled(sms.value.data?.paymentConfirmationEnabled === true);
    } else setSmsConfig({ connected: false, providerError: sms.status === "rejected" ? String(sms.reason) : sms.value.error?.message });
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

  const importGoogleContacts = async () => {
    setBusy(true); setMessage("Importing Google contacts into this business…");
    try {
      const result = await action("contacts.import", { limit: 500 });
      const text = result.message || ((result.imported || 0) + " contact(s) imported.");
      setTests(old => ({ ...old, contacts: text }));
      setMessage(text);
    } catch (e) { setTests(old => ({ ...old, contacts: "Import failed · " + (e instanceof Error ? e.message : "Google contact import failed") })); }
    finally { setBusy(false); }
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

  const saveProviderKey = async (provider: "openrouter" | "sautikit") => {
    const apiKey = (provider === "openrouter" ? openrouterKey : sautikitKey).trim();
    if (!apiKey || !supabase) { setProviderMessage("Paste the API key first."); return; }
    setProviderBusy(true); setProviderMessage(provider === "openrouter" ? "Validating the OpenRouter key…" : "Validating the SautiKit key…");
    try {
      const functionName = provider === "openrouter" ? "twiga-platform-secrets" : "twiga-sautikit";
      const actionName = provider === "openrouter" ? "save_openrouter_key" : "connect";
      const { data, error } = await supabase.functions.invoke(functionName, { body: { action: actionName, apiKey } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      if (provider === "openrouter") setXaiKey(""); else setSautikitKey("");
      setProviderMessage(data?.message || (provider === "openrouter" ? "OpenRouter key validated and saved in encrypted storage." : "SautiKit key validated and saved in encrypted storage."));
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

  const saveSmsCredentials = async () => {
    if (!businessId || !supabase || !smsClientId.trim() || !smsClientSecret.trim() || !smsSenderName.trim()) {
      setSmsMessage("Enter the KIMISMS Client ID, Client Secret and approved Sender ID.");
      return;
    }
    setProviderBusy(true); setSmsMessage("Validating KIMISMS credentials…");
    try {
      const { data, error } = await supabase.functions.invoke("twiga-kimisms", { body: {
        action: "save_credentials", businessId, clientId: smsClientId.trim(),
        clientSecret: smsClientSecret.trim(), senderName: smsSenderName.trim(),
      }});
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setSmsClientId(""); setSmsClientSecret("");
      setSmsConfig((current: any) => ({ ...current, connected: true, keyLast4: data.keyLast4, senderName: data.senderName }));
      setSmsMessage(data.message || "KIMISMS credentials saved securely.");
      await refreshProviders();
    } catch (e) {
      setSmsMessage(e instanceof Error ? e.message : "Could not connect KIMISMS.");
    } finally { setProviderBusy(false); }
  };

  const saveSmsSettings = async () => {
    if (!businessId || !supabase) return;
    setProviderBusy(true); setSmsMessage("Saving business SMS settings…");
    try {
      const { data, error } = await supabase.functions.invoke("twiga-kimisms", { body: {
        action: "save_settings", businessId, senderName: smsSenderName.trim(),
        orderConfirmationEnabled: smsOrderEnabled, paymentConfirmationEnabled: smsPaymentEnabled,
      }});
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setSmsMessage(data.message || "SMS notification settings saved.");
      await refreshProviders();
    } catch (e) { setSmsMessage(e instanceof Error ? e.message : "Could not save SMS settings."); }
    finally { setProviderBusy(false); }
  };

  const sendSmsTest = async () => {
    if (!businessId || !supabase || !smsTestTo.trim()) { setSmsMessage("Enter the Kenyan mobile number you control for this test."); return; }
    if (!window.confirm("Send one billable test SMS to " + smsTestTo.trim() + "? Confirm that you control this number.")) return;
    setProviderBusy(true); setSmsMessage("Sending test SMS…");
    try {
      const { data, error } = await supabase.functions.invoke("twiga-kimisms", { body: {
        action: "send_test", businessId, to: smsTestTo.trim(), message: smsTestMessage.trim(), confirmTestRecipient: true,
      }});
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setSmsMessage(data.message || ("SMS accepted · " + (data.status || "pending")));
    } catch (e) { setSmsMessage(e instanceof Error ? e.message : "SMS test failed."); }
    finally { setProviderBusy(false); }
  };

  const testOpenRouter = async () => {
    if (!supabase) return;
    setProviderBusy(true); setOpenRouterTestMessage("Testing the live free AI setup assistant…");
    try {
      const { data: authData } = await supabase.auth.getUser(); const user = authData?.user;
      const { data, error } = await supabase.functions.invoke("twiga-setup-assistant", { body: { messages: [{ role: "user", content: "Reply with one short sentence confirming that the TWIGA OpenRouter setup assistant is responding." }], ownerProfile: { name: user?.user_metadata?.full_name || "TWIGA owner", email: user?.email || "" } } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setOpenRouterTestMessage(data?.reply || "OpenRouter responded successfully.");
    } catch (e) { setOpenRouterTestMessage(e instanceof Error ? e.message : "OpenRouter test failed."); }
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
            <div className="flex flex-wrap items-center gap-2">{status.connected && <button onClick={() => test(item)} disabled={busy} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700">Test {item.title.replace("Google ", "")}</button>}{status.connected && item.key === "contacts" && <button onClick={() => void importGoogleContacts()} disabled={busy} className="rounded-lg bg-neutral-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Import contacts</button>}{tests[item.key] && <span className="max-w-xs text-xs text-neutral-600">{tests[item.key]}</span>}</div>
          </div>;
        })}
      </div>
      {status.spreadsheetUrl && <a href={status.spreadsheetUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-orange-700 underline">Open business spreadsheet</a>}
    </section>
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Business setup assistant</p><h2 className="mt-1 text-lg font-semibold text-neutral-950">OpenRouter · OpenRouter</h2></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${openrouterConfig.keyConfigured ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-600"}`}>{openrouterConfig.keyConfigured ? "Connected" : openrouterConfig.isAdmin ? "API key needed" : "Managed by TWIGA"}</span></div>
        <p className="mt-2 text-sm leading-6 text-neutral-600">OpenRouter powers the real business onboarding assistant. The key is validated against OpenRouter and stored in Supabase Vault; it is never exposed to customer browsers.</p>
        {openrouterConfig.isAdmin ? <>
          {openrouterConfig.keyConfigured && <p className="mt-2 text-xs text-neutral-500">Encrypted key saved{openrouterConfig.keyLast4 ? ` · ending ${openrouterConfig.keyLast4}` : ""}.</p>}
          <label className="mt-4 block text-sm font-medium text-neutral-800">{openrouterConfig.keyConfigured ? "Replace OpenRouter API key" : "OpenRouter API key"}<input type="password" autoComplete="new-password" value={openrouterKey} onChange={e => setXaiKey(e.target.value)} placeholder="Paste OpenRouter API key" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500" /></label>
          <a href="https://console.openrouter.ai/team/default/api-keys" target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-orange-700 underline">Get a OpenRouter API key ↗</a>
          <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void saveProviderKey("openrouter")} disabled={providerBusy || !openrouterKey.trim()} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Validate & save OpenRouter key</button>{openrouterConfig.keyConfigured && <button onClick={() => void testOpenRouter()} disabled={providerBusy} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-40">Test OpenRouter</button>}</div>
          {openrouterTestMessage && <p role="status" className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{openrouterTestMessage}</p>}
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
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Business SMS provider</p><h2 className="mt-1 text-lg font-semibold text-neutral-950">KIMISMS · SMS notifications</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">KIMISMS sends SMS across Kenyan mobile networks. It uses a Client ID and Client Secret plus your approved Sender ID. This is separate from PalPluss M-Pesa and SautiKit voice. Credentials are encrypted per business.</p>
        </div>
        <span className={"rounded-full px-3 py-1 text-xs font-semibold " + (smsConfig.connected ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-600")}>{smsConfig.connected ? "Connected" : "Not connected"}</span>
      </div>
      {smsConfig.connected && <p className="mt-2 text-xs text-neutral-500">Encrypted SMS credentials saved {smsConfig.keyLast4 ? "· ending " + smsConfig.keyLast4 : ""}. Sender ID: {smsConfig.senderName || smsSenderName || "not set"}.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-800">KIMISMS Client ID<input value={smsClientId} onChange={e => setSmsClientId(e.target.value)} autoComplete="off" placeholder="KIMISMS Client ID" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label>
        <label className="block text-sm font-medium text-neutral-800">{smsConfig.connected ? "Rotate Client Secret" : "KIMISMS Client Secret"}<input type="password" value={smsClientSecret} onChange={e => setSmsClientSecret(e.target.value)} autoComplete="new-password" placeholder="Paste Client Secret" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label>
        <label className="block text-sm font-medium text-neutral-800">Approved Sender ID<input value={smsSenderName} onChange={e => setSmsSenderName(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0,11))} placeholder="Your approved Sender ID" maxLength={11} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm uppercase" /></label>
        <div className="flex items-end"><a href="https://kimipay.co.ke/api/docs/swagger-ui/" target="_blank" rel="noreferrer" className="text-sm font-semibold text-orange-700 underline">KIMISMS API credentials & documentation ↗</a></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void saveSmsCredentials()} disabled={providerBusy || !smsClientId.trim() || !smsClientSecret.trim() || !smsSenderName.trim()} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Validate & save SMS credentials</button></div>
      {smsConfig.connected && <div className="mt-4 rounded-xl border border-neutral-200 p-4">
        <p className="text-sm font-semibold text-neutral-900">Automatic notifications</p>
        <label className="mt-3 flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" className="mt-1" checked={smsOrderEnabled} onChange={e => setSmsOrderEnabled(e.target.checked)} /><span><strong>Order confirmation SMS</strong><span className="block text-xs text-neutral-500">Send an order reference and amount after the business confirms the order, only when the customer has opted in.</span></span></label>
        <label className="mt-3 flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" className="mt-1" checked={smsPaymentEnabled} onChange={e => setSmsPaymentEnabled(e.target.checked)} /><span><strong>Payment receipt SMS</strong><span className="block text-xs text-neutral-500">Send a receipt only after PalPluss reports SUCCESS and the customer has opted in.</span></span></label>
        <button onClick={() => void saveSmsSettings()} disabled={providerBusy || !smsSenderName.trim()} className="mt-3 rounded-xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-800 disabled:opacity-40">Save SMS notification settings</button>
      </div>}
      {smsConfig.connected && <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
        <label className="text-sm font-medium text-neutral-800">Test number<input value={smsTestTo} onChange={e => setSmsTestTo(e.target.value)} placeholder="+2547…" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label>
        <label className="text-sm font-medium text-neutral-800">Test message<input value={smsTestMessage} onChange={e => setSmsTestMessage(e.target.value)} maxLength={1000} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label>
        <div className="flex items-end"><button onClick={() => void sendSmsTest()} disabled={providerBusy || !smsTestTo.trim()} className="h-10 rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white disabled:opacity-40">Send test SMS</button></div>
      </div>}
      {smsMessage && <p role="status" className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{smsMessage}</p>}
      <p className="mt-3 text-xs leading-5 text-neutral-500">A customer SMS consent record is required before an order or payment message can be sent. Sending a test message may incur provider charges.</p>
    </section>
    {providerMessage && <p role="status" className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">{providerMessage}</p>}
    {message && <p role="status" className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">{message}</p>}
  </div>;
}
