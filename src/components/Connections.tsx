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
export default function Connections({ businessId, demo = false }: { businessId: string; demo?: boolean }) {
  const [status, setStatus] = useState<any>({ connected: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [tests, setTests] = useState<Record<string,string>>({});
  const [oauthConfig, setOauthConfig] = useState<any>({ serverConfigured: false });
  const action = useCallback(async (name: string, extra: Record<string,unknown> = {}) => {
    if (!supabase || !businessId) throw new Error("Choose a business workspace first.");
    const { data, error } = await supabase.functions.invoke("google-workspace", { body: { action: name, businessId, ...extra } });
    if (error) throw new Error(error.message); if (data?.error) throw new Error(String(data.error)); return data;
  }, [businessId]);
  const refresh = useCallback(async () => {
    if (!businessId || !supabase) return;
    try { const [connection, oauth] = await Promise.all([action("status"), action("oauth.config")]); setStatus(connection); setOauthConfig(oauth); } catch (e) { setMessage(e instanceof Error ? e.message : "Google status unavailable."); }
  }, [action, businessId]);
  useEffect(() => { void refresh(); }, [refresh]);
  const connect = async () => {
    if (!businessId || !supabase) { setMessage("Create or select a business first."); return; }
    setBusy(true); setMessage("");
    try {
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
  if (demo) return <section className="rounded-2xl border border-neutral-200 bg-white p-6"><h1 className="text-2xl font-semibold">Connections & permissions</h1><p className="mt-2 text-sm text-neutral-500">Sign in to connect Google services for your business.</p></section>;
  return <div className="mx-auto max-w-5xl space-y-5">
    <header className="rounded-2xl border border-neutral-200 bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Workspace integrations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Connections & permissions</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">Connect the business owner's Google account. Each business has its own encrypted Google connection. Permissions are approved in Google's own consent screen.</p>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{!oauthConfig.serverConfigured ? "Google Workspace OAuth is not fully configured on the TWIGA server yet. Add the Google OAuth web client ID and client secret, plus the token encryption key, in Profile → Platform administrator → Google Workspace OAuth." : "Google Workspace OAuth server configuration is ready. Each business owner still needs to approve the four permissions below."}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-800">{status.connected ? "Google connected" : "Google not connected"}</span>
        {status.googleEmail && <span className="text-sm text-neutral-600">{status.googleEmail}</span>}
        <button onClick={connect} disabled={busy || !businessId} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Please wait…" : status.connected ? "Review / reconnect permissions" : "Connect Google account"}</button>
        <button onClick={refresh} disabled={busy || !businessId} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700">Refresh status</button>
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
            <div className="flex flex-wrap items-center gap-2">{status.connected && <button onClick={() => test(item)} disabled={busy} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700">Test {item.title.replace("Google ","")}</button>}{tests[item.key] && <span className="max-w-xs text-xs text-neutral-600">{tests[item.key]}</span>}</div>
          </div>;
        })}
      </div>
      {status.spreadsheetUrl && <a href={status.spreadsheetUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm font-semibold text-orange-700 underline">Open business spreadsheet</a>}
    </section>
    <section className="rounded-2xl border border-neutral-200 bg-white p-5"><h2 className="font-semibold text-neutral-950">What each connection does</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-neutral-600"><li>Calendar: appointment lookup, creation and updates.</li><li>Contacts: customer and staff contact lookup.</li><li>Sheets: business orders and sales records.</li><li>Drive: business exports and files created or selected for TWIGA.</li></ul></section>
    {message && <p role="status" className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">{message}</p>}
  </div>;
}
