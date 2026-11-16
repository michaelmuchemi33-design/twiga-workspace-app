import { useCallback, useEffect, useRef, useState } from "react";
import { RetellWebClient } from "retell-client-js-sdk";
import { supabase } from "@/lib/supabase";

export default function PhoneDesk({ businessId, demo = false }: { businessId: string; demo?: boolean }) {
  const [config, setConfig] = useState<any>({});
  const [greeting, setGreeting] = useState("Hello, thank you for calling {{business_name}}. How can I help you today?");
  const [inboundPrompt, setInboundPrompt] = useState("Greet callers warmly, identify their reason for calling, answer from verified business information, and capture appointment or order requests for staff confirmation. Never invent prices, availability or completed bookings.");
  const [outboundPrompt, setOutboundPrompt] = useState("Only call people when the business has authorised the follow-up. Identify the business, explain the reason, ask if it is a convenient time, and respect requests not to be contacted.");
  const [fromNumber, setFromNumber] = useState("");
  const [toNumber, setToNumber] = useState("");
  const [status, setStatus] = useState("Not started");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const clientRef = useRef<RetellWebClient | null>(null);
  const timeoutRef = useRef<number | null>(null);

  const action = useCallback(async (name: string, extra: Record<string, unknown> = {}) => {
    if (!supabase || !businessId) throw new Error("Choose a business workspace first.");
    const { data, error } = await supabase.functions.invoke("twiga-retell", { body: { action: name, businessId, ...extra } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    return data;
  }, [businessId]);

  const load = useCallback(async () => {
    if (!businessId || !supabase) return;
    try {
      const data = await action("get_config");
      setConfig(data);
      setGreeting(data.greeting || "Hello, thank you for calling {{business_name}}. How can I help you today?");
      setInboundPrompt(data.config?.inbound_prompt || inboundPrompt);
      setOutboundPrompt(data.config?.outbound_prompt || outboundPrompt);
      setFromNumber("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load phone settings.");
    }
  }, [action, businessId, inboundPrompt, outboundPrompt]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    if (clientRef.current) { try { clientRef.current.stopCall(); } catch {} }
  }, []);

  const saveAndPublish = async () => {
    if (!businessId || !greeting.trim()) {
      setMessage("Write the first greeting before publishing the receptionist.");
      return;
    }
    setBusy(true); setMessage("");
    try {
      await action("save_settings", { provider: "retell", greeting, inboundPrompt, outboundPrompt, recordingEnabled: false, recordingNotice: "This call may be recorded to help you." });
      const published = await action("provision_agent");
      setMessage(published.message || "Your receptionist greeting and instructions have been published.");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not publish the receptionist.");
    } finally { setBusy(false); }
  };

  const startBrowserTest = async () => {
    if (clientRef.current) {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      try { clientRef.current.stopCall(); } catch {}
      clientRef.current = null; setStatus("Ended"); return;
    }
    setBusy(true); setMessage(""); setStatus("Connecting");
    try {
      const { data, error } = await supabase!.functions.invoke("twiga-retell-webcall", { body: { action: "create", businessId } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      const client = new RetellWebClient();
      client.on("call_started", () => setStatus("Live"));
      client.on("call_ended", () => { clientRef.current = null; if (timeoutRef.current) window.clearTimeout(timeoutRef.current); setStatus("Ended"); });
      client.on("error", (e: any) => { clientRef.current = null; setStatus(e?.message || "Call error"); });
      clientRef.current = client;
      await client.startCall({ accessToken: data.access_token });
      timeoutRef.current = window.setTimeout(() => {
        if (clientRef.current) { try { clientRef.current.stopCall(); } catch {} clientRef.current = null; setStatus("10-second test ended"); }
      }, 10000);
    } catch (e) {
      clientRef.current = null; setStatus("Not connected");
      setMessage(e instanceof Error ? e.message : "Could not start the browser test.");
    } finally { setBusy(false); }
  };

  const placePhoneCall = async () => {
    if (!fromNumber.trim() || !toNumber.trim()) { setMessage("Enter both the registered caller ID and the destination number."); return; }
    if (!window.confirm("Place an AI-assisted outbound phone call to " + toNumber + "?")) return;
    setBusy(true); setMessage("");
    try {
      const result = await action("create_phone_call", { fromNumber: fromNumber.trim(), toNumber: toNumber.trim() });
      setMessage("Call submitted to Retell. Call ID: " + result.callId + ". Status: " + result.status + ".");
      setStatus("Call submitted");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Phone call could not be placed.");
    } finally { setBusy(false); }
  };

  if (demo) return <div className="rounded-2xl border border-neutral-200 bg-white p-6"><h1 className="text-2xl font-semibold text-neutral-950">Phone & AI receptionist</h1><p className="mt-2 text-sm text-neutral-500">Sign in to connect a real phone number, configure your receptionist greeting and place calls.</p></div>;

  return <div className="mx-auto max-w-5xl space-y-5">
    <header className="rounded-2xl border border-neutral-200 bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-orange-700">TWIGA · Front Desk</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Phone & AI receptionist</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">Set the first words your receptionist speaks, publish its instructions, test the voice in your browser, or place an outbound phone call.</p>
      {!businessId && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Create or select your business first. Open AI Setup to create a workspace.</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 p-3"><p className="text-xs text-neutral-500">AI provider</p><p className="mt-1 font-semibold text-neutral-900">{config.config?.provider || "Not selected"}</p></div>
        <div className="rounded-xl border border-neutral-200 p-3"><p className="text-xs text-neutral-500">Published agent</p><p className="mt-1 font-semibold text-neutral-900">{config.config?.retell_agent_id ? "Connected" : "Not published"}</p></div>
        <div className="rounded-xl border border-neutral-200 p-3"><p className="text-xs text-neutral-500">API credentials</p><p className="mt-1 font-semibold text-neutral-900">{config.keyConfigured ? "Configured" : "Missing"}</p></div>
      </div>
    </header>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-neutral-950">First greeting</h2><p className="mt-1 text-sm text-neutral-500">This is the opening sentence callers hear when the AI answers.</p></div><span className="rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600">Business-specific</span></div>
      <textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={3} maxLength={1200} placeholder="Hello, thank you for calling [Business Name]. My name is [Assistant Name]. How can I help you today?" className="mt-4 w-full rounded-xl border border-neutral-200 p-3 text-sm leading-6 text-neutral-800 outline-none focus:border-orange-500" />
      <p className="mt-2 text-xs text-neutral-500">Keep it short, natural and clear. The setup assistant can help write this for your business.</p>
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-neutral-950">What the receptionist should do</h2>
      <p className="mt-1 text-sm text-neutral-500">These instructions guide its answers, bookings, orders and handovers.</p>
      <label className="mt-4 block text-sm font-medium text-neutral-800">Incoming calls<textarea value={inboundPrompt} onChange={(e) => setInboundPrompt(e.target.value)} rows={6} className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm leading-6 outline-none focus:border-orange-500" /></label>
      <label className="mt-4 block text-sm font-medium text-neutral-800">Outgoing calls and follow-ups<textarea value={outboundPrompt} onChange={(e) => setOutboundPrompt(e.target.value)} rows={4} className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm leading-6 outline-none focus:border-orange-500" /></label>
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={saveAndPublish} disabled={busy || !businessId || !config.keyConfigured} className="rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : "Save & publish receptionist"}</button><button onClick={load} disabled={busy || !businessId} className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-700">Reload settings</button></div>
      {!config.keyConfigured && <p className="mt-3 text-xs text-amber-800">Add the Retell API key in Profile → AI Front Desk before publishing.</p>}
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-neutral-950">Test the voice</h2>
      <p className="mt-1 text-sm text-neutral-500">Start a browser conversation using your microphone. The test automatically ends after 10 seconds.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3"><button onClick={startBrowserTest} disabled={busy || !businessId || !config.config?.retell_agent_id} className="rounded-xl bg-orange-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{clientRef.current ? "End test" : "Start 10-second voice test"}</button><span className="text-sm text-neutral-600">Status: {status}</span></div>
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-neutral-950">Place a phone call</h2>
      <p className="mt-1 text-sm text-neutral-500">Call a customer from a phone number already purchased or imported into your Retell account.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700">Your registered caller ID<input value={fromNumber} onChange={(e) => setFromNumber(e.target.value)} placeholder="+2547XXXXXXXX" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm" /></label>
        <label className="block text-sm font-medium text-neutral-700">Customer phone number<input value={toNumber} onChange={(e) => setToNumber(e.target.value)} placeholder="+2547XXXXXXXX" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm" /></label>
      </div>
      <p className="mt-2 text-xs leading-5 text-neutral-500">Both numbers must use international format. Retell validates that the caller ID belongs to your account. Your existing SIM is not automatically a Retell caller ID.</p>
      <button onClick={placePhoneCall} disabled={busy || !businessId || !config.config?.retell_agent_id} className="mt-4 rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Call customer</button>
    </section>

    {message && <p role="status" className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">{message}</p>}
  </div>;
}
