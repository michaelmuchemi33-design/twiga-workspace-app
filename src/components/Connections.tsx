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
  const [openrouterConfig, setOpenrouterConfig] = useState<any>({});
  const [sautikitKey, setSautikitKey] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState("");
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
    if (!businessId || !supabase) { setStatus({ connected: false, status: "not_connected" }); return; }
    try {
      const [connection, oauth] = await Promise.all([action("status"), action("oauth.config")]);
      setStatus(connection || { connected: false, status: "unavailable" });
      setOauthConfig(oauth);
      setMessage("");
    } catch (e) {
      setStatus({ connected: false, status: "unavailable", verifiedAt: new Date().toISOString() });
      setMessage(e instanceof Error ? e.message : "Google status unavailable.");
    }
  }, [action, businessId]);

  const refreshProviders = useCallback(async () => {
    if (!businessId || !supabase) return;
    const [sautikit, openrouter, sms] = await Promise.allSettled([
      supabase.functions.invoke("twiga-sautikit", { body: { action: "get_config", businessId } }),
      supabase.functions.invoke("twiga-platform-secrets", { body: { action: "get_config" } }),
      supabase.functions.invoke("twiga-kimisms", { body: { action: "get_config", businessId } }),
    ]);
    if (sautikit.status === "fulfilled" && !sautikit.value.error && !sautikit.value.data?.error) setSautikitConfig(sautikit.value.data || {});
    else setSautikitConfig({ isPlatformAdmin: false, providerError: sautikit.status === "rejected" ? String(sautikit.reason) : sautikit.value.error?.message });
    if (openrouter.status === "fulfilled" && !openrouter.value.error && !openrouter.value.data?.error) setOpenrouterConfig(openrouter.value.data || {});
    else setOpenrouterConfig({ isAdmin: false });
    if (sms.status === "fulfilled" && !sms.value.error && !sms.value.data?.error) {
      setSmsConfig(sms.value.data || { connected: false });
      setSmsSenderName(String(sms.value.data?.senderName || ""));
      setSmsOrderEnabled(sms.value.data?.orderConfirmationEnabled === true);
      setSmsPaymentEnabled(sms.value.data?.paymentConfirmationEnabled === true);
    } else setSmsConfig({ connected: false, providerError: sms.status === "rejected" ? String(sms.reason) : sms.value.error?.message });
  }, [businessId]);

  useEffect(() => { void refresh(); void refreshProviders(); }, [refresh, refreshProviders]);

  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        void refreshProviders();
      }
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    const timer = window.setInterval(recheck, 60000);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
      window.clearInterval(timer);
    };
  }, [refresh, refreshProviders]);

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
      if (!cfg.clientId) throw new Error("Google access is not ready yet. TWIGA is handling the configuration; please try again shortly.");
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
      const text = result.message || ((result.imported || 0) + " contact(s) imported to Cloudflare.");
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
      if (provider === "openrouter") setOpenrouterKey(""); else setSautikitKey("");
      setProviderMessage(data?.message || (provider === "openrouter" ? "OpenRouter key validated and saved in encrypted storage." : "SautiKit key validated and saved in encrypted storage."));
      await refreshProviders();
    } catch (e) { setProviderMessage(e instanceof Error ? e.message : "Could not save provider key."); }
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
      <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">Connect Google Calendar, Contacts, Sheets and Drive with one button. TWIGA handles the technical setup for you.</p>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{!oauthConfig.serverConfigured && !googleAuth?.tokens?.accessToken ? "Google is ready to connect. No API keys or developer settings are needed." : "Your Google account can be connected securely below. TWIGA only receives the permissions you approve."}</div>
      
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-800">{status.connected ? (status.permissionsComplete === false ? "Google connected · permissions incomplete" : "Google connected · verified") : status.reconnectRequired ? "Reconnect Google" : "Google not connected"}</span>
        {status.googleEmail && <span className="text-sm text-neutral-600">{status.googleEmail}</span>}
        {status.verifiedAt && <span className="text-xs text-neutral-500">Checked {new Date(status.verifiedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-700">{googleOAuthReady ? "Google ready" : "Google setup in progress"}</span>
        <button onClick={connect} disabled={busy || !businessId} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Please wait…" : status.connected ? "Review / reconnect permissions" : "Connect Google account"}</button>
        <button onClick={() => { void refresh(); void refreshProviders(); }} disabled={busy || providerBusy || !businessId} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700">Refresh status</button>
      </div>
      {!businessId && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Create or select a business in AI Setup first.</p>}
    </header>
    
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-neutral-950">Google permissions</h2><p className="mt-1 text-sm text-neutral-500">These permissions are checked against the active Google token. TWIGA refreshes the status when you return to this page and every minute while it is open. You can revoke access from your Google Account at any time.</p>
      <div className="mt-4 divide-y divide-neutral-100">
        {items.map(item => {
          const granted = (status.scopes || []).some((scope: string) => item.key === "calendar" ? scope.includes("calendar.events") : item.key === "contacts" ? scope.includes("contacts") : item.key === "sheets" ? scope.includes("spreadsheets") : scope.includes("drive.file"));
          return <div key={item.key} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-semibold text-neutral-900">{item.title}</p><p className="mt-1 text-sm text-neutral-500">{item.detail}</p><p className="mt-1 text-xs font-medium text-neutral-600">{status.connected && granted ? "Allowed by Google · verified" : status.connected ? "Not granted · reconnect to approve" : "Not verified"}</p></div>
            <div className="flex flex-wrap items-center gap-2">{status.connected && granted && <button onClick={() => test(item)} disabled={busy} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700">Test {item.title.replace("Google ", "")}</button>}{status.connected && granted && item.key === "contacts" && <button onClick={() => void importGoogleContacts()} disabled={busy} className="rounded-lg bg-neutral-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Import contacts</button>}{tests[item.key] && <span className="max-w-xs text-xs text-neutral-600">{tests[item.key]}</span>}</div>
          </div>;
        })}
      </div>
      {status.spreadsheetUrl && <a href={status.spreadsheetUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-orange-700 underline">Open business spreadsheet</a>}
    </section>
    <section className="rounded-2xl border border-neutral-200 bg-white p-5"><h2 className="text-lg font-semibold text-neutral-950">Your TWIGA services</h2><p className="mt-2 text-sm leading-6 text-neutral-600">Your phone service, payment collection and customer notifications are managed by TWIGA. You do not need separate SautiKit, PalPluss or SMS provider accounts, API keys or external dashboards. Choose your receptionist voice in Phone & AI and manage your payment options in Payments.</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => window.dispatchEvent(new CustomEvent("twiga:navigate", { detail: "phone" }))} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white">Choose receptionist voice</button><button onClick={() => window.dispatchEvent(new CustomEvent("twiga:navigate", { detail: "payments" }))} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-800">Payment settings</button></div></section>
    {providerMessage && <p role="status" className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">{providerMessage}</p>}
    {message && <p role="status" className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">{message}</p>}
  </div>;
}
