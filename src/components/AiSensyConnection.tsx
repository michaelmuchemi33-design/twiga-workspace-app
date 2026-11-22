import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

type SavedIntegration = {
  display_name: string;
  provider_slug: string;
  status: string;
  config?: { campaign_name?: string };
  credentials_last4?: Record<string, string>;
  updated_at?: string;
};

export default function AiSensyConnection({ businessId, demo = false }: { businessId: string; demo?: boolean }) {
  const [apiKey, setApiKey] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [saved, setSaved] = useState<SavedIntegration | null>(null);
  const [actionToken, setActionToken] = useState("");
  const [actionUrl, setActionUrl] = useState("");
  const [handoffUrl, setHandoffUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeKind, setNoticeKind] = useState<"success" | "error" | "info">("info");
  const [copied, setCopied] = useState("");

  const request = useCallback(async (body: Record<string, unknown>) => {
    if (!supabase || !businessId) throw new Error("Choose a business workspace and sign in.");
    const { data, error } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (error || !token) throw new Error("Your session has expired. Sign in again.");
    const response = await fetch("https://twiga-api.twiga-ke.workers.dev/integrations", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ businessId, ...body }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok === false) throw new Error(String(result?.error || "The TWIGA integration service could not complete this request."));
    return result;
  }, [businessId]);

  const refresh = useCallback(async () => {
    if (demo || !businessId) return;
    try {
      const result = await request({ action: "list" });
      const item = (Array.isArray(result.integrations) ? result.integrations : []).find((entry: SavedIntegration) => entry.provider_slug === "aisensy");
      setSaved(item || null);
      if (item?.config?.campaign_name) setCampaignName(item.config.campaign_name);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load the AiSensy connection.");
      setNoticeKind("error");
    }
  }, [businessId, demo, request]);

  useEffect(() => { void refresh(); }, [refresh]);

  const connect = async () => {
    if (demo || busy) return;
    if (apiKey.trim().length < 12) {
      setNotice("Paste the AiSensy API campaign key from your AiSensy Developer settings.");
      setNoticeKind("error");
      return;
    }
    setBusy(true);
    setNotice("Saving this business's encrypted AiSensy credentials…");
    setNoticeKind("info");
    try {
      const result = await request({
        action: "save",
        provider: "aisensy",
        displayName: "AiSensy WhatsApp",
        credentials: { api_key: apiKey.trim() },
        campaignName: campaignName.trim(),
        ownerPhone: ownerPhone.trim(),
      });
      setSaved(result.integration || null);
      setApiKey("");
      setActionToken(String(result.actionToken || ""));
      setActionUrl(String(result.actionUrl || ""));
      setHandoffUrl(String(result.handoffUrl || ""));
      setNotice("AiSensy credentials are encrypted and saved for this business. Configure and test the custom action in AiSensy before launch.");
      setNoticeKind("success");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AiSensy could not be saved.");
      setNoticeKind("error");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1800);
    } catch {
      setNotice("Clipboard access was blocked. Select and copy the value manually.");
      setNoticeKind("error");
    }
  };

  if (demo) {
    return <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">WhatsApp automation</p>
      <h2 className="mt-1 text-xl font-bold text-neutral-950 dark:text-neutral-100">Connect AiSensy</h2>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">Connect a business-owned AiSensy account after signing in to enable WhatsApp AI actions.</p>
    </section>;
  }

  return <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-5 py-4 dark:border-neutral-800 dark:bg-neutral-950">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-orange-700 dark:text-orange-400">WhatsApp AI connection</p>
        <h2 className="mt-1 text-xl font-bold text-neutral-950 dark:text-neutral-100">AiSensy for this business</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-600 dark:text-neutral-300">Connect this business's AiSensy account. TWIGA keeps its API key and private action token encrypted and separate from every other client's workspace.</p>
      </div>
      <span className={"rounded-full border px-3 py-1.5 text-xs font-semibold " + (saved ? "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-200" : "border-neutral-200 bg-white text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300")}>
        {saved ? "Credentials saved · setup pending" : "Not connected"}
      </span>
    </div>
    <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.85fr)]">
      <div className="space-y-4">
        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200">AiSensy API campaign key
          <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" autoComplete="new-password" spellCheck={false} placeholder={saved ? "Enter a new key only to rotate the connection" : "Paste your private AiSensy API key"} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 outline-none focus:border-orange-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
        </label>
        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200">Live API campaign name (optional)
          <input value={campaignName} onChange={e => setCampaignName(e.target.value)} maxLength={120} placeholder="Exact AiSensy campaign name for owner alerts" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 outline-none focus:border-orange-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
          <span className="mt-1 block text-[11px] leading-5 text-neutral-500 dark:text-neutral-400">For owner alerts, create a Live API Campaign in AiSensy using an approved WhatsApp template with two text variables: alert title and alert details. Leave blank until that campaign is ready.</span>
        </label>
        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200">Business owner WhatsApp number (optional)
          <input value={ownerPhone} onChange={e => setOwnerPhone(e.target.value)} maxLength={24} placeholder="+2547XXXXXXXX" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal text-neutral-900 outline-none focus:border-orange-400 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100" />
          <span className="mt-1 block text-[11px] leading-5 text-neutral-500 dark:text-neutral-400">Used to authorize owner-only reports and worker commands. Enter the exact WhatsApp number the owner will message from.</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void connect()} disabled={busy || !apiKey.trim()} className="bg-neutral-950 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950">{busy ? "Saving securely…" : saved ? "Save / rotate AiSensy connection" : "Connect AiSensy"}</Button>
          <Button variant="outline" onClick={() => void refresh()} disabled={busy}>Refresh status</Button>
        </div>
        <p className="text-xs leading-5 text-neutral-500 dark:text-neutral-400">TWIGA does not send a test message when you save this key. Key format acceptance is not proof that the agent, campaign, WhatsApp number or handoff webhook is live.</p>
      </div>
      <div className="space-y-3">
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm leading-6 text-orange-950 dark:border-orange-900 dark:bg-orange-950/30 dark:text-orange-100">
          <p className="font-semibold">What this connection enables</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
            <li>Live catalogue, prices and stock checks.</li>
            <li>Customer-specific order status lookups.</li>
            <li>Confirmed orders and appointment bookings.</li>
            <li>Owner-only sales summaries, chart data and worker tasks.</li>
            <li>Human handoff into the TWIGA owner task queue.</li>
            <li>High-priority owner alerts through an approved AiSensy campaign.</li>
          </ul>
        </div>
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Next: configure the AiSensy AI Agent</p>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-5 text-neutral-600 dark:text-neutral-300">
            <li>Create or open this business's WhatsApp AI Agent in AiSensy.</li>
            <li>Add one Custom API Action using the TWIGA endpoint and one-time bearer token.</li>
            <li>Map the real current contact phone to sender_phone; do not let the agent invent it from chat text.</li>
            <li>Use the action for reports, products, order lookup, confirmed bookings and handoffs.</li>
            <li>Publish the agent and enable an AiSensy AI Messages pack before public use.</li>
          </ol>
        </div>
      </div>
    </div>
    {actionToken && <div className="border-t border-orange-200 bg-orange-50/70 p-5 dark:border-orange-900 dark:bg-orange-950/20">
      <p className="text-sm font-semibold text-neutral-950 dark:text-neutral-100">One-time AiSensy action credentials</p>
      <p className="mt-1 text-xs leading-5 text-neutral-600 dark:text-neutral-300">Copy this bearer token now and paste it into the AiSensy Custom API Action's Authorization header. TWIGA will not display the full token again. Saving the connection again rotates it.</p>
      <div className="mt-3 grid gap-2">
        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200">Action endpoint
          <div className="mt-1 flex gap-2"><input readOnly value={actionUrl} className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200" /><Button size="sm" variant="outline" onClick={() => void copy("endpoint",actionUrl)}>{copied==="endpoint"?"Copied":"Copy"}</Button></div>
        </label>
        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200">Authorization header value
          <div className="mt-1 flex gap-2"><input readOnly type="password" value={"Bearer "+actionToken} className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200" /><Button size="sm" variant="outline" onClick={() => void copy("token","Bearer "+actionToken)}>{copied==="token"?"Copied":"Copy"}</Button></div>
        </label>
        <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-200">Human handoff webhook URL
          <div className="mt-1 flex gap-2"><input readOnly value={handoffUrl} className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200" /><Button size="sm" variant="outline" onClick={() => void copy("handoff",handoffUrl)}>{copied==="handoff"?"Copied":"Copy"}</Button></div>
        </label>
      </div>
    </div>}
    {notice && <p role="status" className={"border-t px-5 py-3 text-sm " + (noticeKind==="success" ? "border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900 dark:bg-orange-950/20 dark:text-orange-100" : noticeKind==="error" ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-200" : "border-neutral-200 bg-neutral-50 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300")}>{notice}</p>}
  </section>;
}
