import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Option = { voice: string; model: string; rate: number; note?: string };
const VOICES: Option[] = [
  { voice: "Woman", model: "sautikit-flash", rate: 4, note: "Tested female voice · current default" },
  { voice: "Man", model: "sautikit-flash", rate: 4, note: "Male voice" },
  ...["Neema", "Zuri", "Amani", "Furaha", "Baraka", "Jabari", "Tumaini", "Simba"].map((voice) => ({ voice, model: "sautikit-voice-2", rate: 7 })),
];
const DEFAULTS = {
  greeting: "Hello, karibu! Thank you for calling {{business_name}}. How can I help you today?",
  inbound: "Answer in the caller's language (Kenyan English or Kiswahili). Identify why they are calling, use verified business information, and capture booking or order requests for the team to confirm. Never say that a booking, order or payment is complete until TWIGA confirms it was saved.",
  outbound: "Only call people when the business has authorised a callback. Introduce yourself and the business, explain the reason, ask whether it is a convenient time, keep it brief, and respect requests not to be called again.",
};
const MARKER = "----- TWIGA FRONT DESK SETTINGS -----";

export default function SautiKitDesk({ businessId, demo = false }: { businessId: string; demo?: boolean; onOpenProfile?: () => void }) {
  const [data, setData] = useState<any>({});
  const [models, setModels] = useState<any[]>([]);
  const [core, setCore] = useState("");
  const [scripts, setScripts] = useState(DEFAULTS);
  const [voice, setVoice] = useState("Woman");
  const [model, setModel] = useState("sautikit-flash");
  const [key, setKey] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("Requested customer follow-up");
  const [authorised, setAuthorised] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [call, setCall] = useState<any>(null);

  const invoke = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!supabase) throw new Error("TWIGA Supabase connection is not configured.");
    const { data: result, error } = await supabase.functions.invoke("twiga-sautikit", {
      body: { action, businessId, ...extra },
    });
    if (error) throw new Error(error.message);
    if (result?.error) throw new Error(String(result.error));
    return result;
  }, [businessId]);

  const refresh = useCallback(async () => {
    if (demo || !businessId || !supabase) return;
    try {
      const result = await invoke("get_config");
      setData(result);
      setModels(Array.isArray(result.models) ? result.models : []);
      setScripts({ ...DEFAULTS, ...(result.scripts || {}) });
      if (result.agent) {
        const prompt = String(result.agent.base_prompt || "");
        setCore(prompt.split(MARKER)[0].trim());
        setVoice(String(result.agent.voice || "Woman"));
        setModel(String(result.agent.model || "sautikit-flash"));
      } else {
        setVoice(String(result.phoneLine?.settings?.inbound_voice || "Woman"));
        setModel(String(result.phoneLine?.settings?.inbound_model_id || "sautikit-flash"));
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not load SautiKit settings.");
    }
  }, [demo, businessId, invoke]);

  useEffect(() => { void refresh(); }, [refresh]);

  const catalogOptions = (() => {
    if (!models.length) return VOICES;
    const flash = models.find((m) => m.id === "sautikit-flash");
    const voice2 = models.find((m) => m.id === "sautikit-voice-2");
    const list: Option[] = [];
    for (const name of ["Woman", "Man"]) if (flash?.voices?.includes(name)) {
      list.push({ voice: name, model: "sautikit-flash", rate: Number(flash.rate_per_minute_minor || 0) / 100, note: name === "Woman" ? "Tested female voice · current default" : "Male voice" });
    }
    for (const name of ["Neema", "Zuri", "Amani", "Furaha", "Baraka", "Jabari", "Tumaini", "Simba"]) if (voice2?.voices?.includes(name)) {
      list.push({ voice: name, model: "sautikit-voice-2", rate: Number(voice2.rate_per_minute_minor || 0) / 100 });
    }
    return list;
  })();

  const line = data.phoneLine;
  const currentAgent = data.agent;
  const active = !!currentAgent?.id;
  const inboundVerified = data.inboundVerified === true;
  const inboundBound = data.inboundBound === true || inboundVerified;
  const selected = catalogOptions.find((v) => v.voice === voice && v.model === model);

  async function connect() {
    if (!key.trim()) return setNotice("Paste the SautiKit API key created for TWIGA.");
    setBusy(true); setNotice("");
    try {
      const result = await invoke("connect", { apiKey: key.trim() });
      setKey("");
      setModels(Array.isArray(result.models) ? result.models : []);
      setNotice(result.message || "SautiKit connected securely.");
      await refresh();
    } catch (e) { setNotice(e instanceof Error ? e.message : "SautiKit connection failed."); }
    finally { setBusy(false); }
  }

  async function publish() {
    if (!selected) return setNotice("Choose an available SautiKit voice.");
    if (!scripts.greeting.trim() || !scripts.inbound.trim() || !scripts.outbound.trim()) return setNotice("Complete all three call scripts first.");
    setBusy(true); setNotice(""); setCall(null);
    try {
      const result = await invoke("publish_agent", {
        voice, model, corePrompt: core,
        greeting: scripts.greeting,
        inboundPrompt: scripts.inbound,
        outboundPrompt: scripts.outbound,
      });
      setNotice("Published revision " + result.revision + ". The same SautiKit agent now uses " + result.voice + " for inbound and outbound calls.");
      await refresh();
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not publish the receptionist."); }
    finally { setBusy(false); }
  }

  async function placeCall() {
    if (!authorised) return setNotice("Confirm that this callback has been authorised before calling.");
    if (!to.trim() || !reason.trim()) return setNotice("Enter the customer's number and the reason for calling.");
    if (!window.confirm("Place an AI callback to " + to.trim() + "? SautiKit usage charges may apply.")) return;
    setBusy(true); setNotice(""); setCall(null);
    try {
      const result = await invoke("send_call", { to: to.trim(), reason: reason.trim(), authorised: true });
      setCall(result.call || result);
      setNotice(result.message || "Callback submitted.");
      setAuthorised(false);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not submit callback."); }
    finally { setBusy(false); }
  }

  async function copyInboundNumber() {
    const number = String(line?.line_number || "");
    if (!number) return;
    try {
      await navigator.clipboard.writeText(number);
      setNotice("Number copied. Call it from a different phone to check inbound answering.");
    } catch { setNotice("Call " + number + " from a different phone to check inbound answering."); }
  }

  if (demo) return <div className="rounded-2xl border border-neutral-200 bg-white p-6"><h1 className="text-2xl font-semibold text-neutral-950">Phone & AI receptionist</h1><p className="mt-2 text-sm text-neutral-500">Sign in to connect SautiKit, choose a voice and manage your receptionist.</p></div>;

  return <div className="mx-auto max-w-5xl space-y-5">
    <header className="rounded-2xl border border-neutral-200 bg-white p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-orange-700">TWIGA · Front Desk</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Phone & AI receptionist</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">One SautiKit agent handles incoming and outgoing calls. Set the voice and instructions once, then publish them to the same existing line.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-neutral-200 p-3"><p className="text-xs text-neutral-500">Provider</p><p className="mt-1 font-semibold text-neutral-900">SautiKit</p></div>
        <div className="rounded-xl border border-neutral-200 p-3"><p className="text-xs text-neutral-500">Active voice</p><p className="mt-1 font-semibold text-neutral-900">{currentAgent?.voice || line?.settings?.inbound_voice || "Woman"}</p></div>
        <div className="rounded-xl border border-neutral-200 p-3"><p className="text-xs text-neutral-500">Published revision</p><p className="mt-1 font-semibold text-neutral-900">{currentAgent?.current_revision ?? line?.settings?.inbound_agent_revision ?? "—"}</p></div>
        <div className="rounded-xl border border-neutral-200 p-3"><p className="text-xs text-neutral-500">Outbound line status</p><p className="mt-1 font-semibold text-neutral-900">{line?.outbound_status || "Not configured"}</p></div>
      </div>
    </header>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-neutral-950">SautiKit connection</h2><p className="mt-1 text-sm text-neutral-500">The key is stored encrypted in Supabase Vault and never returned to the browser.</p></div><span className={"rounded-full px-3 py-1 text-xs font-semibold " + (data.keyConfigured ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>{data.keyConfigured ? "Connected" : "Needs connection"}</span></div>
      {data.keyConfigured ? <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">Connected securely{data.keyLast4 ? " · key ending " + data.keyLast4 : ""}{data.providerError ? <p className="mt-2 text-amber-800">{data.providerError}</p> : null}</div> : <div className="mt-4 space-y-3">
        <p className="text-sm leading-6 text-neutral-600">Create a restricted key in SautiKit under Developers → API keys. It needs model, agent and number read/write access. Only a TWIGA platform administrator can connect the shared key.</p>
        <a className="inline-flex text-sm font-semibold text-orange-700 underline" href="https://app.sautikit.com/developers/api-keys" target="_blank" rel="noreferrer">Open SautiKit API keys</a>
        {data.isPlatformAdmin ? <div className="flex flex-col gap-2 sm:flex-row"><input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste SautiKit API key" className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-500" /><button onClick={connect} disabled={busy || !key.trim()} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Checking…" : "Connect SautiKit"}</button></div> : <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">A TWIGA platform administrator must complete the shared connection.</p>}
      </div>}
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-neutral-950">Choose the receptionist voice</h2><p className="mt-1 text-sm text-neutral-500">Ten voices from the SautiKit catalogue. Your tested Woman voice stays selected by default.</p></div><span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">10 SautiKit voices</span></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {VOICES.map((v) => {
          const exists = catalogOptions.some((item) => item.voice === v.voice && item.model === v.model);
          const isSelected = voice === v.voice && model === v.model;
          const disabled = !data.keyConfigured || (models.length > 0 && !exists);
          return <button key={v.model + ":" + v.voice} type="button" disabled={disabled} onClick={() => { setVoice(v.voice); setModel(v.model); }} className={"rounded-xl border p-3 text-left transition " + (isSelected ? "border-orange-500 bg-orange-50" : "border-neutral-200 bg-white hover:border-neutral-400") + (disabled ? " opacity-60" : "")}>
            <div className="flex items-center justify-between gap-2"><span className="font-semibold text-neutral-900">{v.voice}</span><span className="text-xs text-neutral-500">KSh {v.rate}/min AI</span></div>
            <p className="mt-1 text-xs text-neutral-500">{v.note || "SautiKit Voice 2"}</p>
            {isSelected ? <p className="mt-2 text-xs font-semibold text-orange-800">Selected{v.voice === "Woman" ? " · tested voice" : ""}</p> : null}
          </button>;
        })}
      </div>
      <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-xs leading-5 text-neutral-600">Woman and Man use SautiKit Flash at KSh 4/min AI. The eight named options use SautiKit Voice 2 at KSh 7/min AI. Carrier charges are separate. SautiKit does not label the gender of the eight named voices, so TWIGA does not guess.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3"><p className="text-sm text-neutral-600">Selected: <strong className="text-neutral-900">{voice}</strong> · {model}</p><button onClick={publish} disabled={busy || !data.keyConfigured || !active || !inboundVerified || !selected} className="rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Publishing…" : "Save voice & publish"}</button></div>
      {!inboundVerified ? <p className="mt-2 text-xs text-amber-800">The existing inbound binding could not be verified. Publishing is paused to avoid changing a different route.</p> : null}
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-neutral-950">What the receptionist should say</h2><p className="mt-1 text-sm text-neutral-500">These instructions are used by the same published agent for incoming and outgoing calls.</p>
      <label className="mt-4 block text-sm font-medium text-neutral-800">Opening greeting<textarea value={scripts.greeting} onChange={(e) => setScripts((s) => ({ ...s, greeting: e.target.value }))} rows={2} maxLength={1200} className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm leading-6 outline-none focus:border-orange-500" /></label>
      <label className="mt-4 block text-sm font-medium text-neutral-800">Incoming calls<textarea value={scripts.inbound} onChange={(e) => setScripts((s) => ({ ...s, inbound: e.target.value }))} rows={4} maxLength={5000} className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm leading-6 outline-none focus:border-orange-500" /></label>
      <label className="mt-4 block text-sm font-medium text-neutral-800">Outgoing calls and follow-ups<textarea value={scripts.outbound} onChange={(e) => setScripts((s) => ({ ...s, outbound: e.target.value }))} rows={4} maxLength={5000} className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm leading-6 outline-none focus:border-orange-500" /></label>
      <label className="mt-4 block text-sm font-medium text-neutral-800">Core receptionist knowledge and behaviour<textarea value={core} onChange={(e) => setCore(e.target.value)} rows={7} maxLength={12000} placeholder="Describe the business, its services, customers and how the receptionist should help." className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm leading-6 outline-none focus:border-orange-500" /></label>
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={publish} disabled={busy || !data.keyConfigured || !active || !inboundVerified} className="rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Publishing…" : "Save instructions & publish"}</button><button onClick={refresh} disabled={busy || !businessId} className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-700">Reload settings</button></div>
      <p className="mt-3 text-xs leading-5 text-neutral-500">Publishing creates a new immutable SautiKit revision. The existing number stays bound to the same agent; TWIGA will not replace or rent another number.</p>
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-neutral-950">Incoming calls</h2>
      {line ? <>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Existing business number</p><p className="mt-1 font-semibold text-neutral-950">{line.line_number}</p></div>
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Agent binding</p><p className="mt-1 font-semibold text-neutral-950">{inboundVerified ? "Live route verified" : inboundBound ? "Bound (saved)" : "Needs setup"}</p></div>
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Inbound status</p><p className="mt-1 font-semibold text-neutral-950">{line.inbound_status || "Unknown"}</p></div>
        </div>
        <p className="mt-3 text-sm leading-6 text-neutral-600">{inboundVerified ? "SautiKit confirms this number is routed to the TWIGA agent. It still needs a real incoming call test from another phone before inbound is marked active." : inboundBound ? "TWIGA’s saved phone-line record confirms this number is bound to the TWIGA agent. Connect SautiKit in this dashboard to refresh the provider route; inbound remains in testing until a real incoming call is answered." : "The inbound route has not been confirmed. Do not treat incoming calls as production-ready until the number is bound and tested."}</p>
        <button onClick={copyInboundNumber} className="mt-3 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-800">Copy number for inbound test</button>
        {data.inboundMode ? <p className="mt-2 text-xs text-neutral-500">Routing mode: {data.inboundMode}</p> : null}
      </> : <p className="mt-3 text-sm text-neutral-600">No SautiKit number is assigned to this business.</p>}
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-neutral-950">Outgoing calls</h2><p className="mt-1 text-sm text-neutral-500">Send an authorised callback using the same published SautiKit agent and voice.</p>
      <p className="mt-2 text-xs text-neutral-500">Last outbound test: {line?.settings?.last_outbound_test_call_status || "No verified test recorded"}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700">Customer phone number<input value={to} onChange={(e) => setTo(e.target.value)} placeholder="+2547XXXXXXXX" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm" /></label>
        <label className="block text-sm font-medium text-neutral-700">Reason for calling<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Requested booking follow-up, order update…" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm" /></label>
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" checked={authorised} onChange={(e) => setAuthorised(e.target.checked)} className="mt-1" /><span>I confirm this person or business has authorised this callback.</span></label>
      <button onClick={placeCall} disabled={busy || !data.keyConfigured || !active || !inboundVerified || !to.trim() || !authorised} className="mt-4 rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Submitting…" : "Place authorised AI callback"}</button>
      {call ? <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">Call request: {call.id || call.call_id || call.status || "submitted"}</p> : null}
    </section>

    {data.providerError ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">SautiKit connection check: {data.providerError}</p> : null}
    {notice ? <p role="status" className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">{notice}</p> : null}
  </div>;
}