import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Model = { id: string; voices?: string[]; rate_per_minute_minor?: number; currency?: string };
type SautiKitConfig = { keyConfigured?: boolean; serverDirectReady?: boolean; serverProxyReady?: boolean; keyScope?: string | null; providerConnected?: boolean; providerVerificationAt?: string | null; providerConnectionSource?: string | null; isPlatformAdmin?: boolean; voicePreference?: { voice?: string; model?: string; gender?: string }; phoneLine?: any; number?: any; numberVerified?: boolean; providerNumber?: string; agent?: any; models?: Model[]; scripts?: { greeting?: string; inbound?: string; outbound?: string }; inboundBound?: boolean; inboundVerified?: boolean; providerError?: string };
type ScheduledCall = { id: string; customer_name: string; phone_number: string; reason: string; scheduled_at: string; trigger_type: string; status: string; last_error?: string | null };
type CallRecord = { id: string; created_at: string; direction: string; from_number?: string | null; to_number?: string | null; status: string; duration_seconds?: number | null; summary?: string | null; provider?: string | null; metadata?: Record<string, any> | null };
type OwnerNotification = { id: string; type: string; title: string; body: string; payload?: Record<string, any>; status: string; createdAt: string; readAt?: string | null };

function toE164(value: string) {
  let number = String(value || "").replace(/[\s().-]/g, "");
  if (/^0[17]\d{8}$/.test(number)) number = "+254" + number.slice(1);
  else if (/^254[17]\d{8}$/.test(number)) number = "+" + number;
  return /^\+[1-9]\d{7,14}$/.test(number) ? number : "";
}
function defaultDateTime() { const d = new Date(Date.now() + 10 * 60_000); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); }
function fmtDate(value?: string) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString(); }
function statusClass(status?: string) { return status === "active" || status === "completed" || status === "submitted" ? "border-orange-200 bg-orange-50 text-orange-800" : "border-neutral-200 bg-neutral-50 text-neutral-700"; }

async function functionErrorMessage(error: unknown, fallback: string) {
  const issue = error as { message?: string; context?: Response } | null;
  const response = issue?.context;
  if (response && typeof response.clone === "function") {
    try {
      const payload = await response.clone().json();
      if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
      if (typeof payload?.message === "string" && payload.message.trim()) return payload.message;
    } catch {
      // Use Supabase's status message when the function response is not JSON.
    }
  }
  return issue?.message || fallback;
}

export default function PhoneDesk({ businessId, onOpenProfile, demo = false }: { businessId: string; onOpenProfile?: () => void; demo?: boolean }) {
  const [config, setConfig] = useState<SautiKitConfig>({});
  const [scheduledCalls, setScheduledCalls] = useState<ScheduledCall[]>([]);
  const [callRecords, setCallRecords] = useState<CallRecord[]>([]);
  const [notifications, setNotifications] = useState<OwnerNotification[]>([]);
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
  const autoBindAttempted = useRef("");

  const load = useCallback(async () => {
    if (!businessId || !supabase) return;
    setLoading(true); setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("twiga-sautikit", { body: { action: "get_config", businessId } });
      if (invokeError) throw new Error(await functionErrorMessage(invokeError, "The TWIGA phone service returned an error."));
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
        supabase.from("twiga_call_records").select("id,created_at,direction,from_number,to_number,status,duration_seconds,summary,provider,metadata").eq("business_id", businessId).eq("provider", "sautikit").order("created_at", { ascending: false }).limit(20),
      ]);
      if (scheduled.error) throw new Error(scheduled.error.message);
      if (calls.error) throw new Error(calls.error.message);
      setScheduledCalls((scheduled.data || []) as ScheduledCall[]);
      setCallRecords((calls.data || []) as CallRecord[]);
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token || "";
      if (accessToken) {
        try {
          const inboxResponse = await fetch(`https://twiga-business-files.twiga-ke.workers.dev/v1/ai-notifications/${encodeURIComponent(businessId)}?limit=40`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const inbox = await inboxResponse.json().catch(() => ({}));
          if (inboxResponse.ok && Array.isArray(inbox.notifications)) setNotifications(inbox.notifications as OwnerNotification[]);
          else setNotifications([]);
        } catch {
          setNotifications([]);
        }
      } else {
        setNotifications([]);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Phone desk could not load."); }
    finally { setLoading(false); }
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);
  const allVoices = useMemo(() => (config.models || []).flatMap(m => (m.voices || []).map(voice => ({ model: m.id, voice }))), [config.models]);
  const line = config.phoneLine;
  const settings = line?.settings || {};

  // Existing inbound agents with incomplete tools are repaired automatically
  // when the owner opens Phone Desk. The server preserves the assigned number
  // and never enables outbound calling as part of this repair.
  useEffect(() => {
    const agentId = String(config.agent?.id || "");
    const assignedAgentId = String(settings.inbound_agent_id || "");
    const ready = settings.sautikit_calendar_tools_ready === true
      && settings.sautikit_booking_tool_ready === true
      && settings.sautikit_cloudflare_files_tool_ready === true
      && settings.sautikit_drive_tool_ready === true
      && settings.sautikit_operational_tools_ready === true
      && settings.sautikit_knowledge_tool_ready === true;
    if (!supabase || !businessId || !agentId || assignedAgentId !== agentId
      || line?.inbound_enabled !== true || ready) return;
    const attemptKey = businessId + ":" + agentId;
    if (autoBindAttempted.current === attemptKey) return;
    autoBindAttempted.current = attemptKey;
    let cancelled = false;
    void (async () => {
      setMessage("Connecting your receptionist to your business data and calendar…");
      try {
        const { data, error: invokeError } = await supabase.functions.invoke("twiga-sautikit", {
          body: { action: "bind_agent", businessId },
        });
        if (invokeError) throw new Error(await functionErrorMessage(invokeError, "Could not connect the receptionist tools."));
        if (data?.error) throw new Error(String(data.error));
        if (cancelled) return;
        setMessage(data?.message || "Your receptionist tools have been connected.");
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not connect the receptionist tools. Use Save voice to retry.");
      }
    })();
    return () => { cancelled = true; };
  }, [businessId, config.agent?.id, line?.inbound_enabled, settings.inbound_agent_id,
      settings.sautikit_calendar_tools_ready, settings.sautikit_booking_tool_ready,
      settings.sautikit_cloudflare_files_tool_ready, settings.sautikit_drive_tool_ready,
      settings.sautikit_operational_tools_ready, settings.sautikit_knowledge_tool_ready, load]);
  const displayedPhoneNumber = String(config.providerNumber || config.number?.phone_number || config.number?.number_e164 || config.number?.phoneNumber || config.number?.number || line?.line_number || "");
  const serverDirectReady = config.serverDirectReady === true || config.serverProxyReady === true || (config.serverDirectReady === undefined && config.keyConfigured === true);
  const providerFailed = config.providerConnected === false || line?.inbound_status === "failed" || line?.outbound_status === "failed";
  const canPlaceLiveTest = serverDirectReady && config.numberVerified === true && !!config.agent?.id;
  const canPublishVoice = serverDirectReady && config.numberVerified === true;
  const voiceReadinessIssues = [
    !config.keyConfigured ? "The shared TWIGA SautiKit connection is not configured yet. The platform administrator must add it in Profile → Platform settings." : "",
    config.numberVerified !== true ? "The assigned SautiKit phone number is not yet verified against that account." : "",
    !config.agent?.id ? "The receptionist agent has not been created for this business yet." : "",
    config.agent?.id && !config.inboundBound ? "The receptionist agent is not yet bound to this business phone number for inbound calls." : "",
    !serverDirectReady ? "The shared TWIGA SautiKit provider connection is not available, so live calls remain paused." : "",
  ].filter(Boolean);
  const voiceReadinessMessage = voiceReadinessIssues.join(" ");
  const inboundStatus = config.inboundVerified ? "provider route verified" : config.inboundBound ? "agent bound · pickup test pending" : line?.inbound_status || "not configured";
  const outboundStatus = line?.outbound_status || (line?.outbound_enabled ? "enabled" : "disabled");
  const voiceTestFor = (voice: string) => callRecords.find(call =>
    call.direction === "outbound" && String(call.metadata?.voice || "") === voice
  );
  const voiceTestLabel = (voice: string) => {
    const result = voiceTestFor(voice);
    if (!result) return "No recorded test yet";
    if (result.status === "completed") return "Previously connected" + (result.duration_seconds ? ` · ${result.duration_seconds}s` : "");
    if (result.status === "no_answer") return "Last call rang, but was not answered";
    if (result.status === "failed") return "Last test failed before a conversation";
    return "Last test: " + result.status.replace(/_/g, " ");
  };

  const continueVoice = async () => {
    if (!supabase || !businessId) { setError("Sign in and select a business before choosing a voice."); return; }
    setSavingVoiceChoice(true); setError(""); setMessage("Saving your voice choice…");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("twiga-sautikit", {
        body: { action: "save_voice_preference", businessId, model: voiceModel, voice: voiceId },
      });
      if (invokeError) throw new Error(await functionErrorMessage(invokeError, "The TWIGA phone service returned an error."));
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
    if (!supabase || !businessId) { setError("Sign in and select a business before publishing."); return; }
    if (!canPublishVoice) { setMessage(""); setError(voiceReadinessMessage || "Connect the business SautiKit workspace and assign an active number first."); return; }
    setSavingVoice(true); setError(""); setMessage(config.agent?.id ? "Publishing the receptionist voice and instructions…" : "Creating and publishing this business’s AI receptionist…");
    try {
      const invoke = async (action: string) => {
        const result = await supabase!.functions.invoke("twiga-sautikit", { body: { action, businessId, model: voiceModel, voice: voiceId, corePrompt, greeting, inboundPrompt, outboundPrompt } });
        if (result.error) throw new Error(await functionErrorMessage(result.error, "The TWIGA phone service returned an error."));
        if (result.data?.error) throw new Error(String(result.data.error));
        return result.data || {};
      };
      let result: any;
      if (!config.agent?.id) {
        // First-time setup creates the dedicated agent, booking tool, publishes it and binds the number.
        result = await invoke("create_agent");
      } else {
        // Always re-attach booking, CRM, task and consent-based callback tools.
        // Older published agents can have a working inbound route but zero tools.
        result = await invoke("bind_agent");
        result = await invoke("publish_agent");
      }
      setMessage(result?.message || `The ${voiceId === "Man" ? "male" : "female"} receptionist voice and instructions were saved.`);
      await load();
    } catch (e) { await load(); setError(e instanceof Error ? e.message : "Could not create or publish the receptionist."); }
    finally { setSavingVoice(false); }
  };

  const testVoice = async () => {
    const to = toE164(testPhone);
    if (!to) { setError("Enter a valid phone number, e.g. +2547XXXXXXXX."); return; }
    if (!canPlaceLiveTest) { setError(voiceReadinessMessage || "Live calling is paused until TWIGA completes its business SautiKit workspace connection."); return; }
    setTestingCall(true); setError(""); setMessage("Submitting your voice test call…");
    try {
      const { data, error: invokeError } = await supabase!.functions.invoke("twiga-sautikit", { body: { action: "send_call", businessId, to, voice: voiceId, model: voiceModel, reason: "TWIGA AI receptionist voice test requested by the business owner", authorised: true, consent: true } });
      if (invokeError) throw new Error(await functionErrorMessage(invokeError, "The TWIGA phone service returned an error."));
      if (data?.error) throw new Error(String(data.error));
      setMessage(data?.message || `Your ${voiceId === "Man" ? "male" : "female"} voice test call has been submitted to ${to}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Test call failed."); }
    finally { setTestingCall(false); }
  };

  const scheduleCall = async () => {
    if (!supabase || !businessId) return;
    const phone = toE164(customerPhone);
    if (!phone) { setError("Enter a valid phone number, e.g. +2547XXXXXXXX."); return; }
    if (!callReason.trim()) { setError("Enter the reason for this call."); return; }
    if (!scheduledAt || Number.isNaN(new Date(scheduledAt).getTime())) { setError("Choose a valid date and time."); return; }
    if (!callConsent) { setError("Confirm that the person requested this callback or explicitly consented to it."); return; }
    if (windowStart >= windowEnd) { setError("The allowed calling window end must be later than its start."); return; }
    if ((triggerType === "missed_call" || onlyIfMissed) && !sourceCallId.trim()) { setError("Enter the source call record ID for the missed-call condition."); return; }
    if (onlyIfUnpaid && !orderId.trim()) { setError("Enter the order ID for the unpaid-order condition."); return; }
    setSavingSchedule(true); setError(""); setMessage("Saving the scheduled call…");
    try {
      const { data, error: scheduleError } = await supabase.functions.invoke("twiga-scheduled-calls", {
        body: {
          action: "schedule",
          businessId,
          contacts: [{ name: customerName.trim(), phone }],
          reason: callReason.trim(),
          scheduledAt: new Date(scheduledAt).toISOString(),
          authorised: true,
          timezone: "Africa/Nairobi",
          triggerType,
          sourceCallId: sourceCallId.trim() || undefined,
          orderId: orderId.trim() || undefined,
          onlyIfMissed,
          onlyIfUnpaid,
          callingWindowStart: windowStart,
          callingWindowEnd: windowEnd,
          repeat: "none",
          repeatCount: 1,
          retryOnNoAnswer: true,
        },
      });
      if (scheduleError) throw new Error(await functionErrorMessage(scheduleError, "The schedule service returned an error."));
      if (data?.error) throw new Error(String(data.error));
      if (!data?.success) throw new Error(data?.message || "The call was not added to the schedule queue.");
      setMessage(data?.message || "Call saved to TWIGA schedule. It will dispatch at the selected time and retry once if there is no answer.");
      setCustomerName(""); setCustomerPhone(""); setCallReason(""); setCallConsent(false); setSourceCallId(""); setOrderId(""); setOnlyIfMissed(false); setOnlyIfUnpaid(false);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not schedule the call."); }
    finally { setSavingSchedule(false); }
  };

  const markNotificationRead = async (id: string) => {
    if (!supabase || !businessId) return;
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token || "";
      if (!accessToken) throw new Error("Sign in again to update receptionist alerts.");
      const response = await fetch(`https://twiga-business-files.twiga-ke.workers.dev/v1/ai-notifications/${encodeURIComponent(businessId)}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not mark this receptionist alert as read.");
      setNotifications((items) => items.map((item) => item.id === id ? { ...item, status: "read", readAt: new Date().toISOString() } : item));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the receptionist alert.");
    }
  };

  const cancelScheduledCall = async (id: string) => {
    if (!supabase) return;
    const { error: updateError } = await supabase.from("twiga_scheduled_calls").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("business_id", businessId);
    if (updateError) setError(updateError.message); else { setMessage("Scheduled call cancelled."); await load(); }
  };

  if (demo) return <section className="rounded-2xl border border-neutral-200 bg-white p-6"><h1 className="text-2xl font-semibold">Phone & AI receptionist</h1><p className="mt-2 text-sm text-neutral-800">Sign in and select a business to manage its AI phone line, voices and scheduled calls.</p></section>;

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="rounded-2xl border border-neutral-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">TWIGA · AI phone desk</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">Phone & AI receptionist</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">Manage this business’s SautiKit workspace, assigned phone number, AI receptionist, inbound route, customer callbacks, reminders and consent-based outreach from one place.</p></div><button onClick={() => void load()} disabled={loading} className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm font-semibold text-orange-800 transition hover:bg-orange-100 disabled:opacity-60">{loading ? "Refreshing…" : "Refresh"}</button></div>
    </header>

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 md:col-span-2"><p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Assigned TWIGA AI phone number</p><div className="mt-2 flex flex-wrap items-center gap-3"><p className="text-3xl font-bold tracking-tight text-neutral-950">{displayedPhoneNumber || "No AI line assigned"}</p>{displayedPhoneNumber && <button onClick={() => void navigator.clipboard?.writeText(displayedPhoneNumber)} className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-700">Copy number</button>}{displayedPhoneNumber && <a href={`tel:${displayedPhoneNumber}`} className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700">Call AI receptionist</a>}<span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${config.numberVerified ? "border-emerald-200 bg-emerald-50 text-emerald-800" : providerFailed ? "border-red-200 bg-red-50 text-red-800" : line ? "border-amber-200 bg-amber-50 text-amber-800" : "border-neutral-200 bg-neutral-50 text-neutral-600"}`}>{config.numberVerified ? "Provider confirmed" : providerFailed ? "Provider not connected" : line ? "Saved · provider check pending" : "Not assigned"}</span></div><p className="mt-2 text-xs leading-5 text-neutral-500">{config.numberVerified ? (serverDirectReady ? "The assigned number is verified against TWIGA’s shared SautiKit provider workspace." : "The assigned number was verified directly against SautiKit on " + fmtDate(config.providerVerificationAt || undefined) + ". The shared TWIGA SautiKit connection must be available before this dashboard can place outbound test calls or publish voice changes.") : providerFailed ? "The provider number could not be verified against TWIGA’s shared SautiKit workspace. Live calls remain safely paused until the connection is corrected." : line ? "This number is saved against your TWIGA business, but provider verification is still pending." : "TWIGA has not assigned an AI phone number to this business yet. The platform administrator allocates numbers from the shared SautiKit pool."} Your personal callback number is entered separately when scheduling an authorised call.</p></div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Inbound calls</p><span className={`mt-2 inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClass(config.inboundVerified ? "active" : "pending")}`}>{inboundStatus}</span><p className="mt-2 text-xs text-neutral-500">{line?.inbound_enabled ? "Inbound enabled" : "Inbound disabled"}. A real incoming call is still required to verify pickup end-to-end.</p></div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-5"><p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Outbound calls</p><span className={`mt-2 inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClass(outboundStatus)}`}>{outboundStatus}</span><p className="mt-2 text-xs text-neutral-500">Current voice: {settings.inbound_voice || config.agent?.voice || "Not published"} · {settings.inbound_model_id || config.agent?.model || "No model"}</p></div>
    </section>

    {settings.last_outbound_test_call_status && <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900"><strong>Latest voice test result:</strong> {String(settings.last_outbound_test_call_status).replace(/_/g, " ")}. The result for each real male/female voice is shown in the voice selector.</div>}

    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-neutral-950">Receptionist activity & owner inbox</h2><p className="mt-1 text-sm text-neutral-500">New leads, order requests, appointment requests and callback approvals saved by the AI for this business.</p></div>
        <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800">{notifications.filter((item) => item.status === "unread").length} unread</span>
      </div>
      {notifications.length ? <div className="mt-4 space-y-3">
        {notifications.map((item) => <article key={item.id} className={`rounded-xl border p-4 ${item.status === "unread" ? "border-orange-200 bg-orange-50/50" : "border-neutral-200 bg-white"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-700">{item.type.replace(/_/g, " ")}</span><span className="text-xs text-neutral-500">{fmtDate(item.createdAt)}</span></div><h3 className="mt-2 text-sm font-semibold text-neutral-950">{item.title}</h3><p className="mt-1 text-sm leading-5 text-neutral-700">{item.body}</p>
              {item.payload?.orderId && <p className="mt-2 text-xs font-medium text-neutral-600">Order {String(item.payload.orderId)} · {String(item.payload.currency || "KES")} {Number(item.payload.total || 0).toLocaleString()}</p>}
              {item.payload?.service && <p className="mt-2 text-xs text-neutral-600">Service: {String(item.payload.service)} · {fmtDate(String(item.payload.scheduledAt || ""))}</p>}
              {item.payload?.phone && <p className="mt-1 text-xs text-neutral-600">Customer: {String(item.payload.customerName || "Customer")} · {String(item.payload.phone)}</p>}
            </div>
            {item.status === "unread" && <button onClick={() => void markNotificationRead(item.id)} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50">Mark read</button>}
          </div>
        </article>)}
      </div> : <p className="mt-4 rounded-xl bg-neutral-50 p-4 text-sm text-neutral-600">No receptionist activity yet. When the AI captures a lead, saves an order request or appointment, or requests a callback approval, it will appear here.</p>}
    </section>

    <section className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Step {voiceStep} of 2</p><h2 className="mt-1 text-xl font-semibold text-neutral-950">{voiceStep === 1 ? "Choose your receptionist's voice" : "Finish your receptionist setup"}</h2><p className="mt-1 max-w-2xl text-sm text-neutral-600">{voiceStep === 1 ? "Pick a female or male voice. You can change it later from this page." : "Your voice choice is saved. Review the model and instructions, then publish when the provider is ready."}</p></div>
        <span className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-700">{voiceStep === 1 ? "Voice selection" : "Receptionist settings"}</span>
      </div>
      {voiceStep === 1 ? <div className="mt-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" aria-pressed={voiceId === "Woman"} onClick={() => setVoiceId("Woman")} className={`rounded-2xl border-2 p-5 text-left transition ${voiceId === "Woman" ? "border-orange-500 bg-orange-50" : "border-neutral-200 bg-white hover:border-neutral-400"}`}>
            <span className="flex items-center justify-between"><span className="text-lg font-bold text-neutral-950">Woman</span><span className={`grid h-5 w-5 place-items-center rounded-full border ${voiceId === "Woman" ? "border-orange-500 bg-orange-500 text-white" : "border-neutral-300"}`}>{voiceId === "Woman" ? "✓" : ""}</span></span>
            <span className="mt-2 block text-sm text-neutral-600">Warm, clear female receptionist voice · {voiceTestLabel("Woman")}</span>
          </button>
          <button type="button" aria-pressed={voiceId === "Man"} onClick={() => setVoiceId("Man")} className={`rounded-2xl border-2 p-5 text-left transition ${voiceId === "Man" ? "border-orange-500 bg-orange-50" : "border-neutral-200 bg-white hover:border-neutral-400"}`}>
            <span className="flex items-center justify-between"><span className="text-lg font-bold text-neutral-950">Male</span><span className={`grid h-5 w-5 place-items-center rounded-full border ${voiceId === "Man" ? "border-orange-500 bg-orange-500 text-white" : "border-neutral-300"}`}>{voiceId === "Man" ? "✓" : ""}</span></span>
            <span className="mt-2 block text-sm text-neutral-600">Clear, confident male receptionist voice · {voiceTestLabel("Man")}</span>
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
          <p className="rounded-xl bg-neutral-50 p-3 text-xs leading-5 text-neutral-800">{canPublishVoice ? "The selected voice can be published to your SautiKit receptionist." : voiceReadinessMessage || "You can save your voice choice now. Publishing is paused until the server connection is ready."}</p>
          <button type="button" onClick={() => void publishVoice()} disabled={savingVoice || !voiceModel || !voiceId || !canPublishVoice} title={canPublishVoice ? "Publish this voice and its instructions" : voiceReadinessMessage} className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60">{savingVoice ? "Publishing…" : "Save receptionist voice & instructions"}</button>
          {!canPublishVoice && <p className="text-xs leading-5 text-amber-800">{voiceReadinessMessage}</p>}
        </div>
      </div>}
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold text-neutral-950">Test your AI receptionist</h2><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">Live voice test</span></div>
        <p className="mt-1 text-sm text-neutral-500">Choose a voice and enter your number. Once the TWIGA server connection is ready, press the button and the receptionist will call you.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" aria-pressed={voiceId === "Woman"} onClick={() => setVoiceId("Woman")} className={`rounded-xl border-2 p-3 text-left transition ${voiceId === "Woman" ? "border-orange-500 bg-orange-50" : "border-neutral-200 bg-white hover:border-neutral-400"}`}><span className="block text-base font-bold text-neutral-950">Female voice</span><span className="mt-1 block text-xs text-neutral-600">Warm and friendly</span></button>
          <button type="button" aria-pressed={voiceId === "Man"} onClick={() => setVoiceId("Man")} className={`rounded-xl border-2 p-3 text-left transition ${voiceId === "Man" ? "border-orange-500 bg-orange-50" : "border-neutral-200 bg-white hover:border-neutral-400"}`}><span className="block text-base font-bold text-neutral-950">Male voice</span><span className="mt-1 block text-xs text-neutral-600">Clear and confident</span></button>
        </div>
        <label className="mt-4 block text-sm font-medium text-neutral-800">Phone number to call<input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="0793832286" inputMode="tel" className="mt-1 w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-base text-neutral-950 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></label>
        <p className="mt-2 text-xs text-neutral-500">By pressing the test button, you confirm you can receive a call at this number. Test calls may incur provider charges.</p>
        <button type="button" onClick={() => void testVoice()} disabled={testingCall} title={canPlaceLiveTest ? "Place a live test call" : voiceReadinessMessage} className="mt-4 w-full rounded-xl bg-orange-500 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 active:scale-[.99] disabled:cursor-wait disabled:opacity-60">{testingCall ? "Calling you…" : canPlaceLiveTest ? "Call me and test AI" : "Check live-call setup"}</button>
        {!canPlaceLiveTest && <p className="mt-2 text-xs leading-5 text-neutral-500">{voiceReadinessMessage} Live calling remains safely paused until this business’s SautiKit workspace, number and receptionist are verified.</p>}
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
