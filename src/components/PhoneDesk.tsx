import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Model = { id: string; voices?: string[]; rate_per_minute_minor?: number; currency?: string };
type SautiKitConfig = { keyConfigured?: boolean; isPlatformAdmin?: boolean; voicePreference?: { voice?: string; model?: string; gender?: string }; phoneLine?: any; number?: any; numberVerified?: boolean; providerNumber?: string; agent?: any; models?: Model[]; scripts?: { greeting?: string; inbound?: string; outbound?: string }; inboundBound?: boolean; inboundVerified?: boolean; providerError?: string };
type ScheduledCall = { id: string; customer_name: string; phone_number: string; reason: string; scheduled_at: string; trigger_type: string; status: string; last_error?: string | null };
type CallRecord = { id: string; created_at: string; direction: string; from_number?: string | null; to_number?: string | null; status: string; duration_seconds?: number | null; summary?: string | null; provider?: string | null };

function toE164(value: string) {
  let number = String(value || "").replace(/[\s().-]/g, "");
  if (/^0[17]\d{8}$/.test(number)) number = "+254" + number.slice(1);
  else if (/^254[17]\d{8}$/.test(number)) number = "+" + number;
  return /^\+[1-9]\d{7,14}$/.test(number) ? number : "";
}
function defaultDateTime() { const d = new Date(Date.now() + 10 * 60_000); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function fmtDate(value?: string) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(); }
function statusClass(status?: string) { return status === "active" || status === "completed" || status === "submitted" ? "border-orange-200 bg-orange-50 text-orange-800" : "border-neutral-200 bg-neutral-50 text-neutral-700"; }

export default function PhoneDesk({ businessId, onOpenProfile, demo = false }: { businessId: string; onOpenProfile?: () => void; demo?: boolean }) {
  const [config, setConfig] = useState<SautiKitConfig>({});
  const [scheduledCalls, setScheduledCalls] = useState<ScheduledCall[]>([]);
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);
  const [testingCall, setTestingCall] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [voiceModel, setVoiceModel] = useState("sautikit-flash");
  const [voiceId, setVoiceId] = useState("Woman");
  const [voiceStep, setVoiceStep] = useState(1);
  const [savingVoiceChoice, setSavingVoiceChoice] = useState(false);
  const [corePrompt, setCorePrompt] = useState("");
  const [greeting, setGreeting] = useState("Hello, karibu! How can I help you today?");
  const [inboundPrompt, setInboundPrompt] = useState("");
  const [outboundPrompt, setOutboundPrompt] = useState("");
  const [testPhone, setTestPhone] = useState("0793832286");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [callReason, setCallReason] = useState("");
  const [triggerType, setTriggerType] = useState("timer");
  const [scheduledAt, setScheduledAt] = useState(defaultDateTime);
  const [windowStart, setWindowStart] = useState("08:00");
  const [windowEnd, setWindowEnd] = useState("20:00");
  const [sourceCallId, setSourceCallId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [onlyIfMissed, setOnlyIfMissed] = useState(false);
  const [onlyIfUnpaid, setOnlyIfUnpaid] = useState(false);
  const [callConsent, setCallConsent] = useState(false);

  const load = useCallback(async () => {
    if (!businessId || !supabase) return;
    setLoading(true); setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("twiga-sautikit", { body: { action: "get_config", businessId } });
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(String(data.error));
      const next = (data || {}) as SautiKitConfig;
      setConfig(next);
      const settings = next.phoneLine?.settings || {};
      setVoiceModel(settings.inbound_model_id || next.voicePreference?.model || next.agent?.model || "sautikit-flash");
      const savedGender = settings.voice_gender || next.voicePreference?.gender || "";
      const savedVoice = settings.inbound_voice || next.voicePreference?.voice || next.agent?.voice || "Woman";
      setVoiceId(savedGender === "male" || savedVoice === "Man" ? "Man" : "Woman");
      setVoiceStep(1);
      setCorePrompt(String(next.agent?.base_prompt || "").split("----- TWIGA FRONT DESK SETTINGS -----")[0].trim());
      setGreeting(next.scripts?.greeting || "Hello, karibu! How can I help you today?");
      setInboundPrompt(next.scripts?.inbound || "");
      setOutboundPrompt(next.scripts?.outbound || "");
      const [scheduled, calls] = await Promise.all([
        supabase.from("twiga_scheduled_calls").select("id,customer_name,phone_number,reason,scheduled_at,trigger_type,status,last_error").eq("business_id", businessId).order("scheduled_at", { ascending: true }).limit(50),
        supabase.from("twiga_call_records").select("id,created_at,direction,from_number,to_number,status,duration_seconds,summary,provider").eq("business_id", businessId).eq("provider", "sautikit").order("created_at", { ascending: false }).limit(20),
      ]);
      if (scheduled.error) throw new Error(scheduled.error.message);
      if (calls.error) throw new Error(calls.error.message);
      setScheduledCalls((scheduled.data || []) as ScheduledCall[]);
      setCallRecords((calls.data || []) as CallRecord[]);
    } catch (e) { setError(e instanceof Error ? e.message : "Phone desk could not load."); }
    finally { setLoading(false); }
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);
  const allVoices = useMemo(() => (config.models || []).flatMap(m => (m.voices || []).map(voice => ({ model: m.id, voice }))), [config.models]);
  const voiceOptions = allVoices.length ? allVoices : [{ model: voiceModel || "sautikit-flash", voice: "Woman" }, { model: voiceModel || "sautikit-flash", voice: "amara" }];
  const line = config.phoneLine;
  const settings = line?.settings || {};
  const displayedPhoneNumber = String(config.providerNumber || config.number?.phone_number || config.number?.number_e164 || config.number?.phoneNumber || config.number?.number || line?.line_number || "");
  const providerFailed = config.keyConfigured === false || line?.inbound_status === "failed" || line?.outbound_status === "failed";
  const canPlaceLiveTest = config.keyConfigured === true && config.numberVerified === true && !!config.agent?.id;
  const inboundStatus = config.inboundVerified ? "verified" : config.inboundBound ? "agent bound · live test pending" : line?.inbound_status || "not configured";
  const outboundStatus = line?.outbound_status || (line?.outbound_enabled ? "enabled" : "disabled");

  const continueVoice = async () => {
    if (!supabase || !businessId) { setError("Sign in and select a business before choosing a voice."); return; }
    setSavingVoiceChoice(true); setError(""); setMessage("Saving your voice choice…");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("twiga-sautikit", {
        body: { action: "save_voice_preference", businessId, model: voiceModel, voice: voiceId },
      });
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(String(data.error));
      setVoiceStep(2);
      setMessage(data?.message || "Voice choice saved. Continue setting up your receptionist.");
      await load();
      setVoiceStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your voice choice.");
    } finally { setSavingVoiceChoice(false); }
  };

  const publishVoice = async () => {
    if (!supabase || !businessId) return;
    setSavingVoice(true); setError(""); setMessage("Publishing the selected SautiKit voice and call instructions…");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("twiga-sautikit", { body: { action: "publish_agent", businessId, model: voiceModel, voice: voiceId, corePrompt, greeting, inboundPrompt, outboundPrompt } });
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(String(data.error));
      setMessage(data?.message || `Published ${voiceId} on revision ${data?.revision || "latest"}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not publish the voice."); }
    finally { setSavingVoice(false); }
  };

  const testVoice = async () => {
    const to = toE164(testPhone);
    if (!to) { setError("Enter a valid phone number, e.g. +2547XXXXXXXX."); return; }
    if (!canPlaceLiveTest) { setError("Live calling is paused while TWIGA completes its central SautiKit connection. No customer API key is needed. Please try again after the provider status shows verified."); return; }
    setTestingCall(true); setError(""); setMessage("Submitting your voice test call…");
    try {
      const { data, error: invokeError } = await supabase!.functions.invoke("twiga-sautikit", { body: { action: "send_call", businessId, to, voice: voiceId, model: voiceModel, reason: "TWIGA AI receptionist voice test requested by the business owner", authorised: true, consent: true } });
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(String(data.error));
      setMessage(data?.message || `Your ${voiceId === "Man" ? "male" : "female"} voice test call has been submitted to ${to}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Test call failed."); }
    finally { setTestingCall(false); }
  };

  const scheduleCall = async () => {
    if (!supabase || !businessId) return;
    const phone = toE164(customerPhone);
    if (!phone) { setError("Enter a valid customer phone number, e.g. +2547XXXXXXXX."); return; }
    if (!callReason.trim()) { setError("Enter the reason for this call."); return; }
    if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) { setError("Choose a valid date and time."); return; }
    if (!callConsent) { setError("Confirm the customer requested or explicitly consented to this call."); return; }
    if (windowStart >= windowEnd) { setError("The allowed calling window end must be later than its start."); return; }
    if ((triggerType === "missed_call" || onlyIfMissed) && !sourceCallId.trim()) { setError("Enter the source call record ID for the missed-call condition."); return; }
    if (onlyIfUnpaid && !orderId.trim()) { setError("Enter the order ID for the unpaid-order condition."); return; }
    setSavingSchedule(true); setError(""); setMessage("Saving the scheduled call…");
    try {
      const { error: insertError } = await supabase.from("twiga_scheduled_calls").insert({
        business_id: businessId, customer_name: customerName.trim(), phone_number: phone, reason: callReason.trim(),
        scheduled_at: new Date(scheduledAt).toISOString(), timezone: "Africa/Nairobi", consent_status: "opted_in", trigger_type: triggerType,
        trigger_conditions: { only_if_missed_call: onlyIfMissed, only_if_unpaid: onlyIfUnpaid, order_id: orderId.trim() || null },
        source_call_id: sourceCallId.trim() || null, calling_window_start: windowStart, calling_window_end: windowEnd, max_attempts: 1, retry_interval_minutes: 30, status: "scheduled",
      });
      if (insertError) throw new Error(insertError.message);
      setMessage("Call scheduled. The Supabase worker checks due calls every minute and dispatches only when the SautiKit key and business line are ready.");
      setCustomerName(""); setCustomerPhone(""); setCallReason(""); setCallConsent(false); setSourceCallId(""); setOrderId(""); setOnlyIfMissed(false); setOnlyIfUnpaid(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not schedule the call."); }
    finally { setSavingSchedule(false); }
  };

  const cancelScheduledCall = async (id: string) => {
    if (!supabase) return;
    const { error: updateError } = await supabase.from("twiga_scheduled_calls").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("business_id", businessId);
    if (updateError) setError(updateError.message); else { setMessage("Scheduled call cancelled."); await load(); }
  };

  if (demo) return <section className="rounded-2xl border border-neutral-200 bg-white p-6"><h1 className="text-2xl font-semibold">Phone & AI receptionist</h1><p className="mt-2 text-sm text-neutral-800">Sign in and select a business to manage its AI phone line, voices and scheduled calls.</p></section>;

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="rounded-2xl border border-neutral-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">TWIGA · AI phone desk</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Phone & AI receptionist</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">Manage your AI receptionist, assigned business number, inbound route, customer callbacks, reminders and consent-based outreach from one place. TWIGA manages the voice provider connection centrally.</p></div><button onClick={() => void load()} disabled={loading} className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-800 transition hover:bg-orange-100 disabled:opacity-60">{loading ? "Refreshing…" : "Refresh"}</button></div>
    </header>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 md:col-span-2"><p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Assigned TWIGA AI phone number</p><div className="mt-2 flex flex-wrap items-center gap-3"><p className="text-3xl font-bold tracking-tight text-neutral-950">{displayedPhoneNumber || "No AI line assigned"}</p>{displayedPhoneNumber && <button onClick={() => void navigator.clipboard?.writeText(displayedPhoneNumber)} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700">Copy number</button>}<span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.numberVerified ? "border-emerald-200 bg-emerald-50 text-emerald-800" : providerFailed ? "border-red-200 bg-red-50 text-red-800" : line ? "border-amber-200 bg-amber-50 text-amber-800" : "border-neutral-200 bg-neutral-50 text-neutral-600"}`}>{config.numberVerified ? "Provider confirmed" : providerFailed ? "Provider not connected" : line ? "Saved · provider check pending" : "Not assigned"}</span></div><p className="mt-2 text-xs leading-5 text-neutral-500">{config.numberVerified ? "The number was successfully retrieved from TWIGA’s connected voice provider." : config.keyConfigured === false ? "Your existing SautiKit number is retained. TWIGA’s one-time central server connection still needs to be completed; customers never need to enter provider keys." : providerFailed ? "The provider number could not be verified. Live calls remain safely paused until TWIGA confirms the connection." : line ? "This number is saved against your TWIGA business, but the provider has not been verified yet. TWIGA manages that connection centrally." : "TWIGA has not assigned an AI phone number to this business yet."} Your personal callback number is entered separately when scheduling an authorised call.</p></div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Inbound calls</p><span className={`mt-2 inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClass(config.inboundVerified ? "active" : "pending")}`}>{inboundStatus}</span><p className="mt-2 text-xs text-neutral-500">{line?.inbound_enabled ? "Inbound enabled" : "Inbound disabled"}. A real incoming call is still required to verify pickup end-to-end.</p></div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Outbound calls</p><span className={`mt-2 inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClass(outboundStatus)}`}>{outboundStatus}</span><p className="mt-2 text-xs text-neutral-500">Current voice: {settings.inbound_voice || config.agent?.voice || "Not published"} · {settings.inbound_model_id || config.agent?.model || "No model"}</p></div>
    </section>

    {settings.last_outbound_test_call_status && <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900"><strong>Latest verified voice test:</strong> {String(settings.last_outbound_test_call_status).replace(/_/g, " ")}. The proven female SautiKit voice remains the default until another voice is published.</div>}

    <section className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Step {voiceStep} of 2</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">{voiceStep === 1 ? "Choose your receptionist's voice" : "Finish your receptionist setup"}</h2><p className="mt-1 max-w-2xl text-sm text-neutral-600">{voiceStep === 1 ? "Pick a female or male voice. You can change it later from this page." : "Your voice choice is saved. Review the model and instructions, then publish when the provider is ready."}</p></div>
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-700">{voiceStep === 1 ? "Voice selection" : "Receptionist settings"}</span>
      </div>
      {voiceStep === 1 ? <div className="mt-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" aria-pressed={voiceId === "Woman"} onClick={() => setVoiceId("Woman")} className={`rounded-2xl border-2 p-5 text-left transition ${voiceId === "Woman" ? "border-orange-500 bg-orange-50" : "border-neutral-200 bg-white hover:border-neutral-400"}`}>
            <span className="flex items-center justify-between"><span className="text-lg font-bold text-neutral-950">Woman</span><span className={`grid h-5 w-5 place-items-center rounded-full border ${voiceId === "Woman" ? "border-orange-500 bg-orange-500 text-white" : "border-neutral-300"}`}>{voiceId === "Woman" ? "✓" : ""}</span></span>
            <span className="mt-2 block text-sm text-neutral-600">Warm, clear female receptionist voice</span>
          </button>
          <button type="button" aria-pressed={voiceId === "Man"} onClick={() => setVoiceId("Man")} className={`rounded-2xl border-2 p-5 text-left transition ${voiceId === "Man" ? "border-orange-500 bg-orange-50" : "border-neutral-200 bg-white hover:border-neutral-400"}`}>
            <span className="flex items-center justify-between"><span className="text-lg font-bold text-neutral-950">Male</span><span className={`grid h-5 w-5 place-items-center rounded-full border ${voiceId === "Man" ? "border-orange-500 bg-orange-500 text-white" : "border-neutral-300"}`}>{voiceId === "Man" ? "✓" : ""}</span></span>
            <span className="mt-2 block text-sm text-neutral-600">Clear, confident male receptionist voice</span>
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">Selected: <strong className="text-neutral-900">{voiceId}</strong></p>
          <button type="button" onClick={() => void continueVoice()} disabled={savingVoiceChoice} className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 active:scale-[.99] disabled:cursor-wait disabled:opacity-60">{savingVoiceChoice ? "Saving…" : "Continue →"}</button>
        </div>
      </div> : <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-orange-50 p-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-orange-800">Selected voice</p><p className="font-bold text-neutral-950">{voiceId}</p></div><button type="button" onClick={() => setVoiceStep(1)} className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800">Change voice</button></div>
          <label className="block text-sm font-medium text-neutral-800">AI model<select value={voiceModel} onChange={e => setVoiceModel(e.target.value)} className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm">{(config.models || []).length ? (config.models || []).map(m => <option key={m.id} value={m.id}>{m.id}{typeof m.rate_per_minute_minor === "number" ? ` · ${(m.rate_per_minute_minor / 100).toFixed(2)} per minute` : ""}</option>) : <option value={voiceModel}>{voiceModel}</option>}</select></label>
          <label className="block text-sm font-medium text-neutral-800">Core receptionist instructions<textarea value={corePrompt} onChange={e => setCorePrompt(e.target.value)} rows={5} maxLength={12000} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label>
        </div>
        <div className="space-y-4">
          <label className="block text-sm font-medium text-neutral-800">What the receptionist says first<textarea value={greeting} onChange={e => setGreeting(e.target.value)} rows={2} maxLength={4000} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label>
          <label className="block text-sm font-medium text-neutral-800">Inbound call instructions<textarea value={inboundPrompt} onChange={e => setInboundPrompt(e.target.value)} rows={4} maxLength={5000} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label>
          <label className="block text-sm font-medium text-neutral-800">Outbound call instructions<textarea value={outboundPrompt} onChange={e => setOutboundPrompt(e.target.value)} rows={4} maxLength={5000} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label>
          <p className="rounded-xl bg-neutral-50 p-3 text-xs leading-5 text-neutral-800">{config.keyConfigured && line && config.agent ? "The selected voice can be published to your SautiKit receptionist." : "Your preference is saved. Publishing is available when the SautiKit account, number and receptionist agent are connected."}</p>
          <button onClick={() => void publishVoice()} disabled={savingVoice || !voiceModel || !voiceId || !config.keyConfigured || !config.numberVerified || !config.agent?.id} className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60">{savingVoice ? "Publishing…" : "Save receptionist voice & instructions"}</button>
        </div>
      </div>}
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-neutral-950">Test your AI receptionist</h2><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">Live voice test</span></div>
        <p className="mt-1 text-sm text-neutral-500">Choose a voice, enter your number and press the button. TWIGA will call you so you can speak with your receptionist.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" aria-pressed={voiceId === "Woman"} onClick={() => setVoiceId("Woman")} className={`rounded-xl border-2 p-3 text-left transition ${voiceId === "Woman" ? "border-orange-500 bg-orange-50" : "border-neutral-200 bg-white hover:border-neutral-400"}`}><span className="block text-base font-bold text-neutral-950">Female voice</span><span className="mt-1 block text-xs text-neutral-600">Warm and friendly</span></button>
          <button type="button" aria-pressed={voiceId === "Man"} onClick={() => setVoiceId("Man")} className={`rounded-xl border-2 p-3 text-left transition ${voiceId === "Man" ? "border-orange-500 bg-orange-50" : "border-neutral-200 bg-white hover:border-neutral-400"}`}><span className="block text-base font-bold text-neutral-950">Male voice</span><span className="mt-1 block text-xs text-neutral-600">Clear and confident</span></button>
        </div>
        <label className="mt-4 block text-sm font-medium text-neutral-800">Phone number to call<input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="0793832286" inputMode="tel" className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-base text-neutral-950 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></label>
        <p className="mt-2 text-xs text-neutral-500">By pressing the test button, you confirm you can receive a call at this number. Test calls may incur provider charges.</p>
        <button onClick={() => void testVoice()} disabled={testingCall || !canPlaceLiveTest} className="mt-4 w-full rounded-xl bg-orange-500 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-50">{testingCall ? "Calling you…" : canPlaceLiveTest ? "Call me and test AI" : "Live call setup pending"}</button>
        {!canPlaceLiveTest && <p className="mt-2 text-xs leading-5 text-neutral-500">Your existing number is saved. TWIGA must finish its one-time central SautiKit server connection before this button can place a real call. No API key or setup is required from business customers.</p>}
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-5"><h2 className="text-lg font-semibold text-neutral-950">Inbound routing check</h2><p className="mt-2 text-sm leading-6 text-neutral-600">{config.inboundVerified ? "The inbound provider route is verified." : config.inboundBound ? "The SautiKit agent is bound to this line, but a real incoming call still needs to be tested." : "No verified inbound agent route is reported for this line yet."}</p><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Inbound route</p><p className="mt-1 text-sm font-semibold text-neutral-900">{config.inboundBound ? "Agent bound" : "Not bound"}</p></div><div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Live verification</p><p className="mt-1 text-sm font-semibold text-neutral-900">{config.inboundVerified ? "Verified" : "Pending"}</p></div></div></div>
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-xl font-semibold text-neutral-950">Timer & conditional call scheduler</h2><p className="mt-1 text-sm text-neutral-500">Schedule customer callbacks, appointment reminders and consent-based outreach. The worker checks due calls every minute.</p>
      {!line && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">You can save a schedule now; it will wait until this business has an active SautiKit line and key.</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-800">Customer name<input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer or contact name" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label>
        <label className="block text-sm font-medium text-neutral-800">Customer phone number<input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="+2547XXXXXXXX" inputMode="tel" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label>
        <label className="block text-sm font-medium text-neutral-800 md:col-span-2">Reason for call<textarea value={callReason} onChange={e => setCallReason(e.target.value)} rows={2} placeholder="Appointment reminder, requested callback, order follow-up…" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label>
        <label className="block text-sm font-medium text-neutral-800">Trigger<select value={triggerType} onChange={e => setTriggerType(e.target.value)} className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm"><option value="timer">Timer · call at scheduled time</option><option value="missed_call">Missed-call callback</option><option value="appointment_reminder">Appointment reminder</option><option value="follow_up">Customer follow-up</option><option value="conditional">Conditional outreach</option></select></label>
        <label className="block text-sm font-medium text-neutral-800">Call date & time (device local time)<input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label>
        <label className="block text-sm font-medium text-neutral-800">Allowed calling from<input type="time" value={windowStart} onChange={e => setWindowStart(e.target.value)} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label>
        <label className="block text-sm font-medium text-neutral-800">Allowed calling until<input type="time" value={windowEnd} onChange={e => setWindowEnd(e.target.value)} className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm" /></label>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 p-3"><label className="flex items-start gap-2 text-sm text-neutral-800"><input type="checkbox" checked={onlyIfMissed} onChange={e => setOnlyIfMissed(e.target.checked)} className="mt-1" />Only call if the source call is still missed/unanswered</label><input value={sourceCallId} onChange={e => setSourceCallId(e.target.value)} placeholder="Source missed-call record ID" className="mt-3 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" /></div>
        <div className="rounded-xl border border-neutral-200 p-3"><label className="flex items-start gap-2 text-sm text-neutral-800"><input type="checkbox" checked={onlyIfUnpaid} onChange={e => setOnlyIfUnpaid(e.target.checked)} className="mt-1" />Only call if the order is still unpaid</label><input value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="Order ID for unpaid-order condition" className="mt-3 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" /></div>
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" checked={callConsent} onChange={e => setCallConsent(e.target.checked)} className="mt-1" />The person requested this callback or explicitly consented to receive this call. I have permission to contact this number.</label>
      <button onClick={() => void scheduleCall()} disabled={savingSchedule || !businessId} className="mt-4 rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{savingSchedule ? "Saving…" : "Schedule AI call"}</button>
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-neutral-950">Scheduled calls</h2><p className="mt-1 text-sm text-neutral-500">Timer and conditional calls queued for this business.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500"><th className="py-3 pr-3">When</th><th className="py-3 pr-3">Contact</th><th className="py-3 pr-3">Reason</th><th className="py-3 pr-3">Trigger</th><th className="py-3 pr-3">Status</th><th className="py-3">Action</th></tr></thead><tbody>{scheduledCalls.length ? scheduledCalls.map(call => <tr key={call.id} className="border-b border-neutral-50"><td className="py-3 pr-3 text-neutral-700">{fmtDate(call.scheduled_at)}</td><td className="py-3 pr-3"><div className="font-medium text-neutral-900">{call.customer_name || call.phone_number}</div><div className="text-xs text-neutral-500">{call.phone_number}</div></td><td className="py-3 pr-3 text-neutral-700">{call.reason}</td><td className="py-3 pr-3 text-neutral-600">{call.trigger_type.replace(/_/g, " ")}</td><td className="py-3 pr-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(call.status)}`}>{call.status}</span>{call.last_error && <div className="mt-1 max-w-xs text-xs text-orange-800">{call.last_error}</div>}</td><td className="py-3">{["scheduled", "waiting_for_provider"].includes(call.status) && <button onClick={() => void cancelScheduledCall(call.id)} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700">Cancel</button>}</td></tr>) : <tr><td colSpan={6} className="py-8 text-center text-sm text-neutral-500">No scheduled calls yet.</td></tr>}</tbody></table></div>
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-neutral-950">Recent SautiKit calls</h2><p className="mt-1 text-sm text-neutral-500">Completed, failed and submitted AI calls for this business.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-500"><th className="py-3 pr-3">Time</th><th className="py-3 pr-3">Direction</th><th className="py-3 pr-3">Number</th><th className="py-3 pr-3">Status</th><th className="py-3 pr-3">Duration</th><th className="py-3">Summary</th></tr></thead><tbody>{callRecords.length ? callRecords.map(call => <tr key={call.id} className="border-b border-neutral-50"><td className="py-3 pr-3 text-neutral-600">{fmtDate(call.created_at)}</td><td className="py-3 pr-3 text-neutral-700">{call.direction}</td><td className="py-3 pr-3 text-neutral-700">{call.direction === "inbound" ? call.from_number : call.to_number}</td><td className="py-3 pr-3"><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(call.status)}`}>{call.status}</span></td><td className="py-3 pr-3 text-neutral-600">{call.duration_seconds ? `${call.duration_seconds}s` : "—"}</td><td className="py-3 text-neutral-600">{call.summary || "—"}</td></tr>) : <tr><td colSpan={6} className="py-8 text-center text-sm text-neutral-500">No SautiKit call records yet. Your scheduled calls will appear here after the provider accepts them.</td></tr>}</tbody></table></div>
    </section>
    {message && <p role="status" className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">{message}</p>}
    {error && <p role="alert" className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-800">{error}</p>}
  </div>;
}
