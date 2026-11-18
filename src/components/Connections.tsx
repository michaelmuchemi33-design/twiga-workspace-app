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

async function edgeFunctionError(error: any, fallback: string) {
  const response = error?.context;
  if (response && typeof response.clone === "function") {
    try {
      const payload = await response.clone().json();
      if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
      if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
    } catch {
      try { const body = await response.clone().text(); if (body.trim()) return body.slice(0, 500); } catch { /* no response body */ }
    }
  }
  return error?.message || fallback;
}

export default function Connections({ businessId, demo = false, googleAuth }: { businessId: string; demo?: boolean; googleAuth?: { tokens?: { accessToken: string; refreshToken?: string } | null } }) {
  const [status, setStatus] = useState<any>({ connected: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tests, setTests] = useState<Record<string, string>>({});
  const [oauthConfig, setOauthConfig] = useState<any>({ serverConfigured: false });
  const [sautikitConfig, setSautikitConfig] = useState<any>({});
  const [xaiConfig, setXaiConfig] = useState<any>({});
  const [sautikitKey, setSautikitKey] = useState("");
  const [selectedSautikitNumber, setSelectedSautikitNumber] = useState("");
  const [xaiKey, setXaiKey] = useState("");
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerMessage, setProviderMessage] = useState("");
  const [grokTestMessage, setGrokTestMessage] = useState("");
  const [palplussConfig, setPalplussConfig] = useState<any>({});
  const [palplussApiKey, setPalplussApiKey] = useState("");
  const [palplussBasicAuthorization, setPalplussBasicAuthorization] = useState("");
  const [palplussPaylinkId, setPalplussPaylinkId] = useState("");
  const [palplussChannels, setPalplussChannels] = useState<any[]>([]);
  const [palplussTransactions, setPalplussTransactions] = useState<any[]>([]);
  const [palplussBusy, setPalplussBusy] = useState(false);
  const [palplussMessage, setPalplussMessage] = useState("");
  const [palplussChannelName, setPalplussChannelName] = useState("");
  const [palplussChannelType, setPalplussChannelType] = useState("PAYBILL");
  const [palplussShortcode, setPalplussShortcode] = useState("");
  const [palplussAccountNumber, setPalplussAccountNumber] = useState("");
  const [palplussDefaultChannel, setPalplussDefaultChannel] = useState(true);
  const [palplussStkPhone, setPalplussStkPhone] = useState("");
  const [palplussStkAmount, setPalplussStkAmount] = useState("");

  const action = useCallback(async (name: string, extra: Record<string, unknown> = {}) => {
    if (!supabase || !businessId) throw new Error("Choose a business workspace first.");
    const { data, error } = await supabase.functions.invoke("google-workspace", { body: { action: name, businessId, ...extra } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    return data;
  }, [businessId]);

  const palplussAction = useCallback(async (name: string, extra: Record<string, unknown> = {}) => {
    if (!supabase || !businessId) throw new Error("Choose a business workspace first.");
    const { data, error } = await supabase.functions.invoke("twiga-palpluss", {
      body: { action: name, businessId, ...extra },
    });
    if (error) throw new Error(await edgeFunctionError(error, "PalPluss request failed."));
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
    const [sautikit, xai, palpluss] = await Promise.allSettled([
      supabase.functions.invoke("twiga-sautikit", { body: { action: "get_config", businessId } }),
      supabase.functions.invoke("twiga-platform-secrets", { body: { action: "get_config" } }),
      supabase.functions.invoke("twiga-palpluss", { body: { action: "get_config", businessId } }),
    ]);
    if (sautikit.status === "fulfilled" && !sautikit.value.error && !sautikit.value.data?.error) {
      const cfg = sautikit.value.data || {};
      setSautikitConfig(cfg);
      setSelectedSautikitNumber(cfg.phoneLine?.provider_reference || cfg.availableNumbers?.[0]?.id || "");
    } else {
      setSautikitConfig({ isPlatformAdmin: false, providerError: sautikit.status === "rejected" ? String(sautikit.reason) : await edgeFunctionError(sautikit.value.error, "SautiKit status could not be loaded.") });
    }
    if (xai.status === "fulfilled" && !xai.value.error && !xai.value.data?.error) setXaiConfig(xai.value.data || {});
    else setXaiConfig({ isAdmin: false });

    if (palpluss.status === "fulfilled" && !palpluss.value.error && !palpluss.value.data?.error) {
      const cfg = palpluss.value.data || {};
      setPalplussConfig(cfg);
      setPalplussPaylinkId(String(cfg.paylinkId || ""));
      if (cfg.keyConfigured) {
        const [channelsResult, transactionsResult] = await Promise.allSettled([
          supabase.functions.invoke("twiga-palpluss", { body: { action: "channel.list", businessId } }),
          supabase.functions.invoke("twiga-palpluss", { body: { action: "transactions.list", businessId, limit: 8 } }),
        ]);
        setPalplussChannels(channelsResult.status === "fulfilled" && !channelsResult.value.error ? (channelsResult.value.data?.channels || []) : []);
        setPalplussTransactions(transactionsResult.status === "fulfilled" && !transactionsResult.value.error ? (transactionsResult.value.data?.transactions || []) : []);
      } else {
        setPalplussChannels([]);
        setPalplussTransactions([]);
      }
    } else {
      setPalplussConfig({ keyConfigured: false, error: palpluss.status === "rejected" ? String(palpluss.reason) : await edgeFunctionError(palpluss.value.error, "PalPluss status could not be loaded.") });
      setPalplussChannels([]);
      setPalplussTransactions([]);
    }
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
    setProviderBusy(true); setProviderMessage(provider === "grok" ? "Validating the xAI key…" : "Validating this business’s SautiKit workspace API key…");
    try {
      const functionName = provider === "grok" ? "twiga-platform-secrets" : "twiga-sautikit";
      const actionName = provider === "grok" ? "save_xai_key" : "connect_business";
      const { data, error } = await supabase.functions.invoke(functionName, { body: { action: actionName, apiKey, ...(provider === "sautikit" ? { businessId } : {}) } });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      if (provider === "grok") setXaiKey(""); else setSautikitKey("");
      setProviderMessage(data?.message || (provider === "grok" ? "Grok key validated and saved in encrypted storage." : "This business’s SautiKit workspace key was validated and saved in encrypted storage."));
      await refreshProviders();
    } catch (e: any) {
      // Supabase FunctionsHttpError keeps the Edge Function response in context.
      // Read its JSON body so provider errors (401/403/Vault failures) are shown
      // instead of the unhelpful "Edge Function returned a non-2xx status code".
      let detail = "";
      const response = e?.context;
      if (response && typeof response.clone === "function") {
        try {
          const payload = await response.clone().json();
          detail = String(payload?.error || payload?.message || "");
        } catch {
          try { detail = (await response.clone().text()).slice(0, 500); } catch { /* no readable response body */ }
        }
      }
      const status = Number(response?.status || e?.status || 0);
      setProviderMessage(detail || (status ? "Connection failed (HTTP " + status + "). " : "") + await edgeFunctionError(e, "Could not save provider key."));
    }
    finally { setProviderBusy(false); }
  };

  const assignSautikitNumber = async () => {
    if (!supabase || !businessId || !selectedSautikitNumber) { setProviderMessage("Choose a SautiKit number first."); return; }
    setProviderBusy(true); setProviderMessage("Assigning the selected number to this business…");
    try {
      const { data, error } = await supabase.functions.invoke("twiga-sautikit", { body: { action: "assign_business_number", businessId, numberId: selectedSautikitNumber } });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      setProviderMessage(data?.message || "SautiKit number assigned to this business.");
      await refreshProviders();
    } catch (e: any) {
      const status = Number(e?.context?.status || e?.status || 0);
      setProviderMessage((status ? "Number assignment failed (HTTP " + status + "). " : "") + await edgeFunctionError(e, "Could not assign the SautiKit number."));
    } finally { setProviderBusy(false); }
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

  const savePalplussCredential = async () => {
    if (!businessId || !supabase) { setPalplussMessage("Choose a business first."); return; }
    const apiKey = palplussApiKey.trim();
    const basicAuthorization = palplussBasicAuthorization.trim();
    if (!apiKey && !basicAuthorization) { setPalplussMessage("Enter the PalPluss API key or its Base64 Basic Authorization value."); return; }
    if (apiKey && basicAuthorization) { setPalplussMessage("Use one credential field at a time."); return; }
    setPalplussBusy(true); setPalplussMessage("Validating the PalPluss account and securely saving its credential…");
    try {
      const data = await palplussAction("save_key", apiKey ? { apiKey } : { basicAuthorization });
      setPalplussApiKey(""); setPalplussBasicAuthorization("");
      setPalplussMessage(data?.message || "PalPluss credential validated and saved securely.");
      await refreshProviders();
    } catch (e) { setPalplussMessage(e instanceof Error ? e.message : "Could not connect PalPluss."); }
    finally { setPalplussBusy(false); }
  };

  const savePalplussPaylink = async () => {
    if (!palplussPaylinkId.trim()) { setPalplussMessage("Enter the public PalPluss Paylink ID."); return; }
    setPalplussBusy(true); setPalplussMessage("Saving the business Paylink ID…");
    try {
      const data = await palplussAction("save_paylink", { paylinkId: palplussPaylinkId.trim() });
      setPalplussMessage(data?.message || "Paylink ID saved.");
      await refreshProviders();
    } catch (e) { setPalplussMessage(e instanceof Error ? e.message : "Could not save the Paylink ID."); }
    finally { setPalplussBusy(false); }
  };

  const createPalplussChannel = async () => {
    if (!palplussChannelName.trim() || !palplussShortcode.trim()) { setPalplussMessage("Enter a channel name and shortcode."); return; }
    if (palplussChannelType === "PAYBILL" && !palplussAccountNumber.trim()) { setPalplussMessage("A Paybill requires its account number."); return; }
    setPalplussBusy(true); setPalplussMessage("Creating the payment channel in PalPluss…");
    try {
      const data = await palplussAction("channel.create", {
        name: palplussChannelName.trim(), type: palplussChannelType,
        shortcode: palplussShortcode.trim(), accountNumber: palplussAccountNumber.trim(),
        isDefault: palplussDefaultChannel,
      });
      setPalplussChannelName(""); setPalplussShortcode(""); setPalplussAccountNumber("");
      setPalplussMessage(data?.channel ? "Payment channel created and linked to this business." : "Payment channel request completed.");
      await refreshProviders();
    } catch (e) { setPalplussMessage(e instanceof Error ? e.message : "Could not create the payment channel."); }
    finally { setPalplussBusy(false); }
  };

  const sendPalplussStk = async () => {
    const amount = Number(palplussStkAmount);
    const phone = palplussStkPhone.trim();
    if (!Number.isFinite(amount) || amount < 1 || !phone) { setPalplussMessage("Enter a valid KSh amount and Kenyan mobile number."); return; }
    const confirmed = window.confirm("Send a LIVE M-Pesa payment prompt for KSh " + amount.toLocaleString() + " to " + phone + "? The customer may be asked to approve a real payment.");
    if (!confirmed) return;
    setPalplussBusy(true); setPalplussMessage("Sending the M-Pesa prompt…");
    try {
      const data = await palplussAction("stk", { amount, phone, transactionDesc: "TWIGA business payment" });
      setPalplussMessage(data?.message || "M-Pesa prompt initiated. Wait for the PalPluss callback before treating it as paid.");
      await refreshProviders();
    } catch (e) { setPalplussMessage(e instanceof Error ? e.message : "Could not send the M-Pesa prompt."); }
    finally { setPalplussBusy(false); }
  };

  if (demo) return <section className="rounded-2xl border border-neutral-200 bg-white p-6"><h1 className="text-2xl font-semibold">Connections & permissions</h1><p className="mt-2 text-sm text-neutral-500">Sign in to connect Google services for your business.</p></section>;

  const googleOAuthReady = !!oauthConfig.serverConfigured;
  const sautikitProviderConnected = sautikitConfig.providerConnected === true;
  const sautikitDirectReady = sautikitConfig.serverDirectReady === true || sautikitConfig.serverProxyReady === true || sautikitConfig.keyConfigured === true;
  const sautikitBadge = sautikitDirectReady
    ? (sautikitProviderConnected && sautikitConfig.inboundVerified ? "Direct · verified" : "Workspace connected · setup needed")
    : "Connect workspace";
  return <div className="mx-auto max-w-5xl space-y-5">
    <header className="rounded-2xl border border-neutral-200 bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Workspace integrations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Connections & permissions</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">Connect Google services for each business and manage the TWIGA AI providers. API keys are validated on the server and stored in encrypted Supabase Vault, never in browser storage.</p>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{!oauthConfig.serverConfigured && !googleAuth?.tokens?.accessToken ? "Manual Google reconnection needs the Google OAuth web client ID and client secret in TWIGA server settings. If you sign in with Google, TWIGA can use the approved sign-in token to connect these services automatically." : "Google Workspace permissions can be connected using your approved Google sign-in or the separate consent screen."}</div>
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
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Business setup assistant</p><h2 className="mt-1 text-lg font-semibold text-neutral-950">Grok · xAI</h2></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${xaiConfig.xaiKeyConfigured ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-600"}`}>{xaiConfig.xaiKeyConfigured ? "Connected" : xaiConfig.isAdmin ? "API key needed" : "Managed by TWIGA"}</span></div>
        <p className="mt-2 text-sm leading-6 text-neutral-600">Grok powers the real business onboarding assistant. The key is validated against xAI and stored in Supabase Vault; it is never exposed to customer browsers.</p>
        {xaiConfig.isAdmin ? <>
          {xaiConfig.xaiKeyConfigured && <p className="mt-2 text-xs text-neutral-500">Encrypted key saved{xaiConfig.xaiKeyLast4 ? ` · ending ${xaiConfig.xaiKeyLast4}` : ""}.</p>}
          <label className="mt-4 block text-sm font-medium text-neutral-800">{xaiConfig.xaiKeyConfigured ? "Replace Grok API key" : "Grok API key"}<input type="password" autoComplete="new-password" value={xaiKey} onChange={e => setXaiKey(e.target.value)} placeholder="Paste xAI API key" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500" /></label>
          <a href="https://console.x.ai/team/default/api-keys" target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-orange-700 underline">Get a Grok API key ↗</a>
          <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void saveProviderKey("grok")} disabled={providerBusy || !xaiKey.trim()} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Validate & save Grok key</button>{xaiConfig.xaiKeyConfigured && <button onClick={() => void testGrok()} disabled={providerBusy} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-40">Test Grok</button>}</div>
          {grokTestMessage && <p role="status" className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{grokTestMessage}</p>}
        </> : <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">Only the TWIGA platform administrator can manage this shared API key.</p>}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">AI phone provider</p><h2 className="mt-1 text-lg font-semibold text-neutral-950">SautiKit · Direct API</h2></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${sautikitProviderConnected ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-600"}`}>{sautikitBadge}</span></div>
        <p className="mt-2 text-sm leading-6 text-neutral-600">Connect the SautiKit workspace that owns this business’s phone number. TWIGA calls SautiKit directly using HTTPS Bearer authentication; Composio is not in the phone-call path. Each business key is stored separately in encrypted Supabase Vault and is never exposed to the browser after saving.</p>
        {sautikitConfig.phoneLine?.line_number && <p className="mt-2 text-sm font-semibold text-neutral-900">Saved AI line: {sautikitConfig.phoneLine.line_number}</p>}
        {sautikitConfig.keyConfigured && <p className="mt-2 text-xs text-neutral-500">Encrypted credential saved{sautikitConfig.keyLast4 ? ` · ending ${sautikitConfig.keyLast4}` : ""}{sautikitConfig.keyScope ? ` · ${sautikitConfig.keyScope} scope` : ""}.</p>}
        <label className="mt-4 block text-sm font-medium text-neutral-800">{sautikitConfig.keyScope === "business" ? "Replace this business’s SautiKit workspace API key" : "SautiKit workspace API key"}<input type="password" autoComplete="new-password" value={sautikitKey} onChange={e => setSautikitKey(e.target.value)} placeholder="Paste SautiKit workspace API key" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500" /></label>
        <p className="mt-2 text-xs leading-5 text-neutral-500">Create the key inside the SautiKit workspace that owns this business’s phone number: Developers → API keys. Use a workspace key, not a personal/KYC key or Composio key. If the saved phone number belongs to a different SautiKit workspace, TWIGA will report that mismatch and keep calling disabled until the correct number is assigned.</p>
        <a href="https://app.sautikit.com/developers/api-keys" target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-semibold text-orange-700 underline">Open SautiKit API keys ↗</a>
        <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void saveProviderKey("sautikit")} disabled={providerBusy || !businessId || !sautikitKey.trim()} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{providerBusy ? "Checking…" : "Validate & connect this business"}</button><button onClick={() => void refreshProviders()} disabled={providerBusy || !businessId} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-40">Refresh status</button></div>
        {Array.isArray(sautikitConfig.availableNumbers) && sautikitConfig.availableNumbers.length > 0 && <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <label className="block text-sm font-medium text-neutral-800">Phone number in this SautiKit workspace
            <select value={selectedSautikitNumber} onChange={e => setSelectedSautikitNumber(e.target.value)} className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm">
              {sautikitConfig.availableNumbers.map((number: any) => <option key={number.id} value={number.id}>{number.e164 || number.id} · {number.status}</option>)}
            </select>
          </label>
          <button onClick={() => void assignSautikitNumber()} disabled={providerBusy || !selectedSautikitNumber} className="mt-3 rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-40">Assign selected number to this business</button>
        </div>}
        {sautikitConfig.providerError && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{sautikitConfig.providerError}</p>}
      </div>
    </section>
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Payments · business workspace</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">PalPluss · M-Pesa & payment tools</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">Connect this business's PalPluss account, manage its Paylink and collection channels, check transactions and send a customer payment prompt when authorised.</p></div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${palplussConfig.keyConfigured ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-600"}`}>{palplussConfig.keyConfigured ? (palplussConfig.keySource === "business" ? "Business account connected" : "Platform account available") : "Credential needed"}</span>
      </div>
      <div className="mt-4 rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs leading-5 text-orange-950">
        <strong>Credential format:</strong> enter the PalPluss API key or a Base64 Basic Authorization value for API_KEY: (API key followed by a colon). PalPluss uses HTTP Basic authentication here, not a separate Safaricom Daraja OAuth token. TWIGA validates the credential on the server and stores the API key in encrypted Supabase Vault; it is never saved in browser storage.
      </div>
      {palplussConfig.keyConfigured && <p className="mt-3 text-xs text-neutral-500">Encrypted credential saved{palplussConfig.keyLast4 ? ` · ending ${palplussConfig.keyLast4}` : ""}{palplussConfig.keySource ? ` · ${palplussConfig.keySource} scope` : ""}. {palplussConfig.keyUpdatedAt ? "Updated " + new Date(palplussConfig.keyUpdatedAt).toLocaleString() + "." : ""}</p>}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-800">PalPluss API key
          <input type="password" autoComplete="new-password" value={palplussApiKey} onChange={e => setPalplussApiKey(e.target.value)} placeholder="Paste the API key from your PalPluss dashboard" className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500" />
        </label>
        <label className="block text-sm font-medium text-neutral-800">Base64 Basic Authorization (optional)
          <input type="password" autoComplete="new-password" value={palplussBasicAuthorization} onChange={e => setPalplussBasicAuthorization(e.target.value)} placeholder="Base64 value or Basic … header" className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-orange-500" />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => void savePalplussCredential()} disabled={palplussBusy || !businessId || (!palplussApiKey.trim() && !palplussBasicAuthorization.trim()) || (Boolean(palplussApiKey.trim()) && Boolean(palplussBasicAuthorization.trim()))} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{palplussBusy ? "Please wait…" : palplussConfig.keyConfigured ? "Validate & replace credential" : "Validate & connect PalPluss"}</button>
        <button onClick={() => void refreshProviders()} disabled={palplussBusy || !businessId} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 disabled:opacity-40">Refresh PalPluss status</button>
        <a href="https://www.palpluss.com/" target="_blank" rel="noreferrer" className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-orange-700">Open PalPluss dashboard ↗</a>
      </div>
      {palplussConfig.keyConfigured && <>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-neutral-200 p-4">
            <h3 className="font-semibold text-neutral-900">Paylink configuration</h3>
            <p className="mt-1 text-xs leading-5 text-neutral-500">Save the public Paylink ID that belongs to this business. The private API credential is stored separately in Vault.</p>
            <label className="mt-3 block text-xs font-semibold text-neutral-700">Paylink ID<input value={palplussPaylinkId} onChange={e => setPalplussPaylinkId(e.target.value)} placeholder="Public Paylink ID" className="mt-1.5 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm font-normal" /></label>
            <button onClick={() => void savePalplussPaylink()} disabled={palplussBusy || !palplussPaylinkId.trim()} className="mt-3 rounded-lg bg-neutral-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Save Paylink ID</button>
          </div>
          <div className="rounded-xl border border-neutral-200 p-4">
            <h3 className="font-semibold text-neutral-900">M-Pesa STK prompt</h3>
            <p className="mt-1 text-xs leading-5 text-neutral-500">This sends a live payment prompt. Only use it after the customer has agreed to pay this amount.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-neutral-700">Amount (KSh)<input type="number" min="1" step="1" value={palplussStkAmount} onChange={e => setPalplussStkAmount(e.target.value)} placeholder="e.g. 1500" className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm font-normal" /></label>
              <label className="text-xs font-semibold text-neutral-700">Customer phone<input value={palplussStkPhone} onChange={e => setPalplussStkPhone(e.target.value)} placeholder="07XXXXXXXX" className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm font-normal" /></label>
            </div>
            <button onClick={() => void sendPalplussStk()} disabled={palplussBusy || !palplussStkAmount || !palplussStkPhone.trim()} className="mt-3 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Send M-Pesa prompt</button>
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-neutral-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold text-neutral-900">Payment channels</h3><p className="mt-1 text-xs text-neutral-500">Add the channels registered on this PalPluss account.</p></div><span className="text-xs text-neutral-500">{palplussChannels.length} saved</span></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <input value={palplussChannelName} onChange={e => setPalplussChannelName(e.target.value)} placeholder="Channel name" className="rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
            <select value={palplussChannelType} onChange={e => setPalplussChannelType(e.target.value)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm"><option value="PAYBILL">Paybill</option><option value="TILL_NUMBER">Till number</option><option value="SEND_MONEY">Send money</option></select>
            <input value={palplussShortcode} onChange={e => setPalplussShortcode(e.target.value)} placeholder="Shortcode" className="rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
            <input value={palplussAccountNumber} onChange={e => setPalplussAccountNumber(e.target.value)} disabled={palplussChannelType !== "PAYBILL"} placeholder={palplussChannelType === "PAYBILL" ? "Paybill account number" : "Account number (optional)"} className="rounded-lg border border-neutral-200 px-3 py-2 text-sm disabled:bg-neutral-50" />
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-neutral-600"><input type="checkbox" checked={palplussDefaultChannel} onChange={e => setPalplussDefaultChannel(e.target.checked)} className="accent-orange-500" />Set as this business's default payment channel</label>
          <button onClick={() => void createPalplussChannel()} disabled={palplussBusy || !palplussChannelName.trim() || !palplussShortcode.trim()} className="mt-3 rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-40">Create payment channel</button>
          {palplussChannels.length > 0 && <div className="mt-3 divide-y divide-neutral-100">{palplussChannels.map((channel: any) => <div key={channel.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span className="font-medium text-neutral-800">{channel.name} · {channel.type}</span><span className="text-xs text-neutral-500">{channel.shortcode}{channel.account_number ? " / " + channel.account_number : ""}{channel.is_default ? " · Default" : ""}</span></div>)}</div>}
          {palplussChannels.length === 0 && <p className="mt-3 text-xs text-neutral-500">No channels are saved for this business yet.</p>}
        </div>
        <div className="mt-5 rounded-xl border border-neutral-200 p-4">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-neutral-900">Recent transactions</h3><span className="text-xs text-neutral-500">{palplussTransactions.length} shown</span></div>
          {palplussTransactions.length > 0 ? <div className="mt-2 divide-y divide-neutral-100">{palplussTransactions.map((tx: any, index: number) => <div key={tx.id || tx.transactionId || index} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span className="font-medium text-neutral-800">{tx.accountReference || tx.external_reference || tx.transactionId || tx.id || "Payment"}</span><span className="text-xs text-neutral-500">{tx.status || "Unknown"}{tx.amount !== undefined ? " · KSh " + Number(tx.amount).toLocaleString() : ""}</span></div>)}</div> : <p className="mt-2 text-xs text-neutral-500">No PalPluss transactions returned yet.</p>}
        </div>
      </>}
      {palplussConfig.error && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{palplussConfig.error}</p>}
      {palplussMessage && <p role="status" className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">{palplussMessage}</p>}
    </section>
    {providerMessage && <p role="status" className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">{providerMessage}</p>}
    {message && <p role="status" className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">{message}</p>}
  </div>;
}
