import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ScheduledCallsPanel from "./ScheduledCallsPanel";

type Option = { voice: string; model: string; rate: number; label: string; note: string; tested?: boolean };
const MODEL_LABELS: Record<string, string> = {
  "sautikit-flash": "Flash",
  "sautikit-flash-large": "Flash Large",
  "sautikit-voice-2": "Voice 2",
  "sautikit-pro": "Pro",
  "sautikit-reason": "Reason",
};
const DEFAULTS = {
  greeting: "Hello, karibu! Thank you for calling {{business_name}}. How can I help you today?",
  inbound: "Answer in the caller's language (Kenyan English or Kiswahili). Identify why they are calling, use verified business information, and capture booking or order requests for the team to confirm. Never say that a booking, order or payment is complete until TWIGA confirms it was saved.",
  outbound: "Only call people when the business has authorised a callback. Introduce yourself and the business, explain the reason, ask whether it is a convenient time, keep it brief, and respect requests not to be called again.",
};
const MARKER = "----- TWIGA FRONT DESK SETTINGS -----";

export default function SautiKitDesk({ businessId, demo = false, onOpenProfile }: { businessId: string; demo?: boolean; onOpenProfile?: () => void }) {
  const [data, setData] = useState<any>({});
  const [models, setModels] = useState<any[]>([]);
  const [core, setCore] = useState("");
  const [scripts, setScripts] = useState(DEFAULTS);
  const [voice, setVoice] = useState("Woman");
  const [model, setModel] = useState("sautikit-flash");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("Requested customer follow-up");
  const [authorised, setAuthorised] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [call, setCall] = useState<any>(null);
  const [showAllVoiceOptions, setShowAllVoiceOptions] = useState(false);
  const [forwardMode, setForwardMode] = useState<"always" | "after_hours">("after_hours");
  const [forwardTo, setForwardTo] = useState("");
  const [forwardOpening, setForwardOpening] = useState("08:00");
  const [forwardClosing, setForwardClosing] = useState("18:00");
  const [forwardBusy, setForwardBusy] = useState(false);

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
      const savedForward = result.phoneLine?.settings?.forwarding_config || {};
      if (savedForward.mode === "always" || savedForward.mode === "after_hours") setForwardMode(savedForward.mode);
      if (savedForward.to) setForwardTo(String(savedForward.to));
      if (savedForward.openingTime) setForwardOpening(String(savedForward.openingTime));
      if (savedForward.closingTime) setForwardClosing(String(savedForward.closingTime));
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

  // Only expose voice/model pairs returned by the connected SautiKit API.
  // This prevents fallback/demo names from appearing as selectable production voices.
  const catalogOptions: Option[] = (() => {
    const list: Option[] = [];
    const seenPairs = new Set<string>();
    for (const entry of models) {
      const modelId = String(entry.id || "");
      if (!modelId) continue;
      const modelLabel = MODEL_LABELS[modelId] || modelId;
      const rate = Number(entry.rate_per_minute_minor || 0) / 100;
      const voices = Array.isArray(entry.voices) ? entry.voices.map(String) : [];
      for (const name of voices) {
        if (!name || name === "Either") continue;
        const pair = modelId + ":" + name;
        if (seenPairs.has(pair)) continue;
        seenPairs.add(pair);
        const isBinaryVoice = name === "Man" || name === "Woman";
        list.push({
          voice: name,
          model: modelId,
          rate,
          label: name + " · " + modelLabel,
          note: isBinaryVoice
            ? (name === "Man" ? "Male voice · provider-listed option" : "Female voice · provider-listed option")
            : "Named SautiKit catalogue voice · gender not specified by provider",
        });
      }
    }
    return list;
  })();
  const visibleVoiceOptions = showAllVoiceOptions ? catalogOptions : catalogOptions.slice(0, 25);

  const line = data.phoneLine;
  const currentAgent = data.agent;
  const active = !!currentAgent?.id;
  const inboundVerified = data.inboundVerified === true;
  const inboundBound = data.inboundBound === true || inboundVerified;
  const selected = catalogOptions.find((v) => v.voice === voice && v.model === model);


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

  async function saveForwarding() {
    const target = forwardTo.trim().replace(/[()\s-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(target)) return setNotice("Enter the forwarding number with country code, for example +2547XXXXXXXX.");
    if (forwardMode === "always" && !window.confirm("Forward ALL calls on this number directly to " + target + "? This takes incoming calls away from the AI receptionist.")) return;
    if (forwardMode === "after_hours" && !window.confirm("Forward calls outside " + forwardOpening + "–" + forwardClosing + " (Nairobi time) to " + target + "? The AI will keep handling calls during the opening hours.")) return;
    setForwardBusy(true); setNotice("");
    try {
      const result = await invoke("configure_forwarding", {
        mode: forwardMode, to: target, openingTime: forwardOpening, closingTime: forwardClosing,
        sequential: true, ringTimeout: 20,
      });
      setNotice(result.message || "SautiKit accepted the forwarding configuration.");
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Forwarding was not applied. Check the provider number and SautiKit workspace.");
    } finally { setForwardBusy(false); }
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
      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-3"><p className="text-xs text-neutral-600">Business phone number</p><p className="mt-1 font-semibold text-neutral-950">{line?.line_number || "No number assigned"}</p></div>
        <div className="rounded-xl border border-neutral-200 p-3"><p className="text-xs text-neutral-500">Provider</p><p className="mt-1 font-semibold text-neutral-900">SautiKit</p></div>
        <div className="rounded-xl border border-neutral-200 p-3"><p className="text-xs text-neutral-500">Active voice</p><p className="mt-1 font-semibold text-neutral-900">{currentAgent?.voice || line?.settings?.inbound_voice || "Woman"}</p></div>
        <div className="rounded-xl border border-neutral-200 p-3"><p className="text-xs text-neutral-500">Published revision</p><p className="mt-1 font-semibold text-neutral-900">{currentAgent?.current_revision ?? line?.settings?.inbound_agent_revision ?? "—"}</p></div>
        <div className="rounded-xl border border-neutral-200 p-3"><p className="text-xs text-neutral-500">Outbound line status</p><p className="mt-1 font-semibold text-neutral-900">{line?.outbound_status || "Not configured"}</p></div>
      </div>
    </header>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-neutral-950">SautiKit connection</h2><p className="mt-1 text-sm text-neutral-500">The provider key is managed from Connections and stored encrypted in Supabase Vault.</p></div><span className={"rounded-full px-3 py-1 text-xs font-semibold " + (data.keyConfigured ? "bg-orange-50 text-orange-800" : "bg-amber-50 text-amber-800")}>{data.keyConfigured ? "Connected" : "Needs connection"}</span></div>
      {data.keyConfigured ? <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">Connected securely{data.keyLast4 ? " · key ending " + data.keyLast4 : ""}</div> : <div className="mt-4 space-y-3"><p className="text-sm leading-6 text-neutral-600">Connect the SautiKit API key from the same SautiKit workspace that owns this phone number. TWIGA uses it to load the live catalogue, verify the inbound agent binding and submit authorised callbacks.</p><a className="inline-flex text-sm font-semibold text-orange-700 underline" href="https://app.sautikit.com/developers/api-keys" target="_blank" rel="noreferrer">Open SautiKit API keys ↗</a>{data.isPlatformAdmin ? <button onClick={onOpenProfile} className="block rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white">Open Connections to add key</button> : <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">A TWIGA platform administrator must complete the shared connection.</p>}</div>}
      {data.providerError ? <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900"><strong>Provider check needs attention:</strong> {data.providerError} Voice choices may still load, but TWIGA will not publish a voice or mark inbound calls active until the real SautiKit agent and phone-number route are verified.</p> : null}
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-neutral-950">Choose the receptionist voice</h2><p className="mt-1 text-sm text-neutral-500">Available voices are loaded directly from the connected SautiKit catalogue. Only provider-returned voice/model pairs can be selected.</p></div><span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">{catalogOptions.length ? catalogOptions.length + " live voice/model options" : "Waiting for live catalogue"}</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(["Man", "Woman"] as const).map((gender) => {
          const option = catalogOptions.find((v) => v.voice === gender && v.model === model)
            || catalogOptions.find((v) => v.voice === gender);
          const selectedGender = voice === gender;
          return <button key={gender} type="button" disabled={!data.keyConfigured || !models.length || !option}
            onClick={() => { if (option) { setVoice(option.voice); setModel(option.model); } }}
            className={"rounded-xl border-2 px-4 py-3 text-left transition " + (selectedGender ? "border-orange-500 bg-orange-50" : "border-neutral-200 bg-white hover:border-orange-300") + (!data.keyConfigured || !models.length || !option ? " opacity-50" : "")}>
            <span className="block text-sm font-semibold text-neutral-950">{gender === "Man" ? "Male voice" : "Female voice"}</span>
            <span className="mt-1 block text-xs text-neutral-600">{option ? option.voice + " · " + (MODEL_LABELS[option.model] || option.model) : "Not available in the connected catalogue"}</span>
            {selectedGender ? <span className="mt-2 inline-block text-xs font-semibold text-orange-800">Currently selected</span> : <span className="mt-2 inline-block text-xs font-medium text-neutral-500">Choose this voice</span>}
          </button>;
        })}
      </div>
      <p className="mt-3 text-xs text-neutral-500">Choose Male or Female for a quick switch, or select a named provider voice below. The selected voice is applied to inbound and outbound calls only after SautiKit accepts the publish request.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {visibleVoiceOptions.map((v) => {
          const isSelected = voice === v.voice && model === v.model;
          const disabled = !data.keyConfigured || !models.length;
          return <button key={v.model + ":" + v.voice} type="button" disabled={disabled} onClick={() => { setVoice(v.voice); setModel(v.model); }} className={"rounded-xl border p-3 text-left transition " + (isSelected ? "border-orange-500 bg-orange-50" : "border-neutral-200 bg-white hover:border-neutral-400") + (disabled ? " opacity-60" : "")}>
            <div className="flex items-center justify-between gap-2"><span className="font-semibold text-neutral-900">{v.label}</span><span className="shrink-0 text-xs text-neutral-500">KSh {v.rate}/min AI</span></div>
            <p className="mt-1 text-xs text-neutral-500">{v.note}</p>
            {isSelected ? <p className="mt-2 text-xs font-semibold text-orange-800">Selected{v.tested ? " · your tested voice" : ""}</p> : null}
          </button>;
        })}
        {!catalogOptions.length ? <p className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-600 sm:col-span-2 xl:col-span-5">{data.providerError ? "SautiKit catalogue could not be loaded: " + data.providerError : data.keyConfigured ? "Loading the live SautiKit voice catalogue…" : "Connect the SautiKit API key above to load the live voice catalogue. No unverified or sample voices are selectable."}</p> : null}
      </div>
      {catalogOptions.length > 25 ? <button type="button" onClick={() => setShowAllVoiceOptions((v) => !v)} className="mt-3 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700">{showAllVoiceOptions ? "Show first 25 voices" : "Show all " + catalogOptions.length + " voice/model options"}</button> : null}
      <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-xs leading-5 text-neutral-600">This is a 5-column list showing up to 25 voice/model combinations at a time. TWIGA displays the actual names and model combinations returned by SautiKit; it does not invent extra voices. Man and Woman are labelled according to the provider's catalogue. Other named voices are not assigned a gender unless SautiKit specifies one. AI usage rates are per minute; carrier charges are separate.</p>
      <div className="mt-4 flex flex-wrap items-center gap-3"><p className="text-sm text-neutral-600">Selected: <strong className="text-neutral-900">{voice}</strong> · {model}</p><button onClick={publish} disabled={busy || !data.keyConfigured || !active || !inboundBound || !selected} className="rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Publishing…" : "Save voice & publish"}</button></div>
      {!inboundBound ? <p className="mt-2 text-xs text-amber-800">The existing inbound binding is not confirmed in TWIGA records. Publishing is paused to protect the current line.</p> : null}{inboundBound && !inboundVerified ? <p className="mt-2 text-xs text-amber-800">TWIGA records the agent as bound, but SautiKit has not yet confirmed the route. Publishing remains paused until the API key is connected and the live binding is verified.</p> : null}
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-neutral-950">What the receptionist should say</h2><p className="mt-1 text-sm text-neutral-500">These instructions are used by the same published agent for incoming and outgoing calls.</p>
      <label className="mt-4 block text-sm font-medium text-neutral-800">Opening greeting<textarea value={scripts.greeting} onChange={(e) => setScripts((s) => ({ ...s, greeting: e.target.value }))} rows={2} maxLength={1200} className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm leading-6 outline-none focus:border-orange-500" /></label>
      <label className="mt-4 block text-sm font-medium text-neutral-800">Incoming calls<textarea value={scripts.inbound} onChange={(e) => setScripts((s) => ({ ...s, inbound: e.target.value }))} rows={4} maxLength={5000} className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm leading-6 outline-none focus:border-orange-500" /></label>
      <label className="mt-4 block text-sm font-medium text-neutral-800">Outgoing calls and follow-ups<textarea value={scripts.outbound} onChange={(e) => setScripts((s) => ({ ...s, outbound: e.target.value }))} rows={4} maxLength={5000} className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm leading-6 outline-none focus:border-orange-500" /></label>
      <label className="mt-4 block text-sm font-medium text-neutral-800">Core receptionist knowledge and behaviour<textarea value={core} onChange={(e) => setCore(e.target.value)} rows={7} maxLength={12000} placeholder="Describe the business, its services, customers and how the receptionist should help." className="mt-2 w-full rounded-xl border border-neutral-200 p-3 text-sm leading-6 outline-none focus:border-orange-500" /></label>
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={publish} disabled={busy || !data.keyConfigured || !active || !inboundBound} className="rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Publishing…" : "Save instructions & publish"}</button><button onClick={refresh} disabled={busy || !businessId} className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-semibold text-neutral-700">Reload settings</button></div>
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
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-neutral-950">Call forwarding</h2><p className="mt-1 text-sm leading-6 text-neutral-500">Choose whether the existing SautiKit number rings a staff member directly or forwards only outside your normal business hours. The provider must confirm the number before the route can be changed.</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">{line?.settings?.forwarding_config?.providerConfirmed ? "Provider confirmed" : "Not configured"}</span></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700">Forwarding rule<select value={forwardMode} onChange={e => setForwardMode(e.target.value as "always" | "after_hours")} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm"><option value="after_hours">After-hours only · AI answers during business hours</option><option value="always">Direct forwarding · staff receives all calls</option></select></label>
        <label className="block text-sm font-medium text-neutral-700">Staff phone number<input value={forwardTo} onChange={e => setForwardTo(e.target.value)} placeholder="+2547XXXXXXXX" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm" /></label>
      </div>
      {forwardMode === "after_hours" ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium text-neutral-700">Business opens (Nairobi time)<input type="time" value={forwardOpening} onChange={e => setForwardOpening(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm" /></label><label className="block text-sm font-medium text-neutral-700">Business closes (Nairobi time)<input type="time" value={forwardClosing} onChange={e => setForwardClosing(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm" /></label></div> : <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Direct forwarding sends all incoming calls to the staff number instead of letting the AI receptionist answer first.</p>}
      <button onClick={saveForwarding} disabled={forwardBusy || !data.keyConfigured || !line?.provider_reference || !forwardTo.trim()} className="mt-4 rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{forwardBusy ? "Applying routing…" : "Save forwarding rule"}</button>
      {!line?.provider_reference ? <p className="mt-2 text-xs text-amber-800">The provider number ID is not linked in this workspace. Connect the SautiKit account that owns the existing number before applying forwarding.</p> : null}
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-neutral-950">Outgoing calls</h2><p className="mt-1 text-sm text-neutral-500">Send an authorised callback using the same published SautiKit agent and voice.</p>
      <p className="mt-2 text-xs text-neutral-500">Last outbound test: {line?.settings?.last_outbound_test_call_status || "No verified test recorded"}</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700">Customer phone number<input value={to} onChange={(e) => setTo(e.target.value)} placeholder="+2547XXXXXXXX" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm" /></label>
        <label className="block text-sm font-medium text-neutral-700">Reason for calling<input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Requested booking follow-up, order update…" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm" /></label>
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" checked={authorised} onChange={(e) => setAuthorised(e.target.checked)} className="mt-1" /><span>I confirm this person or business has authorised this callback.</span></label>
      <button onClick={placeCall} disabled={busy || !data.keyConfigured || !active || !inboundBound || !to.trim() || !authorised} className="mt-4 rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Submitting…" : "Place authorised AI callback"}</button>
      {call ? <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">Call request: {call.id || call.call_id || call.status || "submitted"}</p> : null}
    </section>

    <ScheduledCallsPanel businessId={businessId} defaultPhone={to} defaultReason={reason} enabled={!!data.keyConfigured && active && inboundBound} />

    {data.providerError ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">SautiKit connection check: {data.providerError}</p> : null}
    {notice ? <p role="status" className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">{notice}</p> : null}
  </div>;
}