import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Model = { id: string; voices?: string[] };
type CallRecord = { id: string; created_at: string; direction: string; status: string; duration_seconds?: number | null };
type SautiKitConfig = {
  keyConfigured?: boolean;
  serverDirectReady?: boolean;
  serverProxyReady?: boolean;
  providerConnected?: boolean;
  providerError?: string;
  phoneLine?: any;
  number?: any;
  numberVerified?: boolean;
  providerNumber?: string;
  agent?: any;
  models?: Model[];
  voicePreference?: { voice?: string; model?: string; gender?: string };
  inboundBound?: boolean;
  inboundVerified?: boolean;
};

function toE164(value: string) {
  let number = String(value || "").replace(/[\s().-]/g, "");
  if (/^0[17]\d{8}$/.test(number)) number = "+254" + number.slice(1);
  else if (/^254[17]\d{8}$/.test(number)) number = "+" + number;
  return /^\+[1-9]\d{7,14}$/.test(number) ? number : "";
}

async function getFunctionError(error: unknown, fallback: string) {
  const issue = error as { message?: string; context?: Response } | null;
  const response = issue?.context;
  if (response && typeof response.clone === "function") {
    const payload = await response.clone().json().catch(() => null);
    if (payload?.error) return String(payload.error);
    if (payload?.message) return String(payload.message);
  }
  return issue?.message || fallback;
}

export default function PhoneDesk({ businessId, onOpenProfile, demo = false }: {
  businessId: string;
  onOpenProfile?: () => void;
  demo?: boolean;
}) {
  const [config, setConfig] = useState<SautiKitConfig>({});
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [voice, setVoice] = useState<"Woman" | "Man">("Woman");
  const [model, setModel] = useState("sautikit-flash");
  const [testPhone, setTestPhone] = useState("");
  const [recipientConsent, setRecipientConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);
  const [placingTest, setPlacingTest] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (demo || !businessId || !supabase) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("twiga-sautikit", {
        body: { action: "get_config", businessId },
      });
      if (invokeError) throw new Error(await getFunctionError(invokeError, "Phone service could not be loaded."));
      if (data?.error) throw new Error(String(data.error));
      const next = (data || {}) as SautiKitConfig;
      setConfig(next);
      const settings = next.phoneLine?.settings || {};
      const savedGender = String(settings.voice_gender || next.voicePreference?.gender || "");
      setVoice(savedGender === "male" ? "Man" : "Woman");
      setModel(String(settings.inbound_model_id || next.voicePreference?.model || next.agent?.model || "sautikit-flash"));

      const { data: records, error: recordsError } = await supabase
        .from("twiga_call_records")
        .select("id,created_at,direction,status,duration_seconds")
        .eq("business_id", businessId)
        .eq("provider", "sautikit")
        .order("created_at", { ascending: false })
        .limit(4);
      if (recordsError) throw new Error(recordsError.message);
      setCalls((records || []) as CallRecord[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Phone service could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [businessId, demo]);

  useEffect(() => { void load(); }, [load]);

  const line = config.phoneLine;
  const phoneNumber = String(config.providerNumber || config.number?.phone_number || config.number?.number_e164 || line?.line_number || "Not assigned");
  const serverReady = config.serverDirectReady === true || config.serverProxyReady === true || config.keyConfigured === true;
  const canPublish = !demo && !!supabase && serverReady && config.numberVerified === true && !!line;
  const canTest = canPublish && !!config.agent?.id;
  const inboundStatus = config.inboundVerified
    ? "Verified"
    : config.inboundBound
      ? "Connected · test pending"
      : String(line?.inbound_status || "Not configured").replace(/_/g, " ");
  const outboundStatus = "Test only · campaigns off";

  const saveVoice = async (selectedVoice: "Woman" | "Man" = voice) => {
    setVoice(selectedVoice);
    if (!supabase || !businessId || demo) {
      setError("Sign in to save a business voice.");
      return;
    }
    setSavingVoice(true);
    setError("");
    setMessage("");
    try {
      const { data: saved, error: saveError } = await supabase.functions.invoke("twiga-sautikit", {
        body: { action: "save_voice_preference", businessId, model, voice: selectedVoice },
      });
      if (saveError) throw new Error(await getFunctionError(saveError, "Voice preference could not be saved."));
      if (saved?.error) throw new Error(String(saved.error));
      if (!canPublish) {
        setMessage((selectedVoice === "Woman" ? "Female" : "Male") + " voice selected and saved. Assign a business phone number to use it on live calls.");
        return;
      }

      const base = {
        businessId,
        model,
        voice: selectedVoice,
        greeting: "Hello, thank you for calling. How can I help you today?",
        inboundPrompt: "Answer in clear English or Kiswahili using only this business's saved details and verified TWIGA records. Keep replies short. Do not invent prices, stock, appointments or payment status.",
        outboundPrompt: "Only place a one-off test call when the recipient has explicitly agreed. Identify TWIGA and the business, explain the reason for the test, keep it brief and end immediately if asked.",
      };
      const invoke = async (action: string) => {
        const { data, error: invokeError } = await supabase!.functions.invoke("twiga-sautikit", { body: { action, ...base } });
        if (invokeError) throw new Error(await getFunctionError(invokeError, "Phone provider returned an error."));
        if (data?.error) throw new Error(String(data.error));
        return data || {};
      };
      let published: any;
      if (!config.agent?.id) {
        published = await invoke("create_agent");
      } else {
        await invoke("bind_agent");
        published = await invoke("publish_agent");
      }
      setMessage(published?.message || "Voice published. Phone line remains in test mode until an inbound test succeeds.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Voice could not be saved.");
    } finally {
      setSavingVoice(false);
    }
  };

  const placeTestCall = async () => {
    const to = toE164(testPhone);
    if (!to) {
      setError("Enter a valid number, for example +2547XXXXXXXX.");
      return;
    }
    if (!recipientConsent) {
      setError("Confirm that the person receiving the test call agreed to it.");
      return;
    }
    if (!canTest || !supabase) {
      setError(config.providerError || "A verified phone number and a published receptionist are required before testing.");
      return;
    }
    setPlacingTest(true);
    setError("");
    setMessage("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("twiga-sautikit", {
        body: {
          action: "send_call",
          businessId,
          to,
          voice,
          model,
          reason: "One-off TWIGA receptionist voice test",
          authorised: true,
          consent: true,
          testMode: true,
        },
      });
      if (invokeError) throw new Error(await getFunctionError(invokeError, "The test call could not be started."));
      if (data?.error) throw new Error(String(data.error));
      setMessage(data?.message || "One-off test call submitted.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Test call failed.");
    } finally {
      setPlacingTest(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">Phone</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-950">Calls and voice</h1>
          <p className="mt-1 text-sm text-neutral-600">One voice for incoming calls and approved test calls.</p>
        </div>
        <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700">Testing mode</span>
      </div>

      {demo && <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">Sample phone setup. Live calls are disabled in the demo.</div>}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Business phone</p>
          <p className="mt-1 font-semibold text-neutral-950">{phoneNumber}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Incoming calls</p>
          <p className="mt-1 font-semibold text-neutral-950">{inboundStatus}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Outgoing calls</p>
          <p className="mt-1 font-semibold text-neutral-950">{outboundStatus}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold text-neutral-950">Receptionist voice</h2>
        <p className="mt-1 text-sm text-neutral-600">Choose one voice. TWIGA uses the same selected voice for inbound calls and one-off outbound tests.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" aria-pressed={voice === "Woman"} onClick={() => void saveVoice("Woman")} className={"rounded-xl border-2 p-4 text-left transition " + (voice === "Woman" ? "border-orange-500 bg-orange-50" : "border-neutral-200 hover:border-neutral-400")}>
            <span className="flex items-center justify-between gap-2"><span className="font-semibold text-neutral-950">Female voice</span>{voice === "Woman" && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">Selected</span>}</span>
            <span className="mt-1 block text-xs text-neutral-600">Warm and clear</span>
          </button>
          <button type="button" aria-pressed={voice === "Man"} onClick={() => void saveVoice("Man")} className={"rounded-xl border-2 p-4 text-left transition " + (voice === "Man" ? "border-orange-500 bg-orange-50" : "border-neutral-200 hover:border-neutral-400")}>
            <span className="flex items-center justify-between gap-2"><span className="font-semibold text-neutral-950">Male voice</span>{voice === "Man" && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">Selected</span>}</span>
            <span className="mt-1 block text-xs text-neutral-600">Clear and confident</span>
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-neutral-500">Current model: {model === "sautikit-flash" ? "TWIGA Fast" : model}</p>
          <span className="text-xs text-neutral-500">{savingVoice ? "Saving selected voice…" : "Voice saves when you select it."}</span>
        </div>
        {!canPublish && !demo && <p className="mt-3 text-xs leading-5 text-neutral-600">The selected voice is saved. A verified business phone number is needed before the receptionist can use it on live calls.</p>}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-neutral-950">Test a call</h2>
          <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-800">One call · no retries</span>
        </div>
        <p className="mt-1 text-sm text-neutral-600">Enter your number or another person's number only after they agree to receive this test call.</p>
        <label className="mt-4 block text-sm font-medium text-neutral-800">Recipient phone number
          <input value={testPhone} onChange={(event) => { setTestPhone(event.target.value); setError(""); }} placeholder="+2547XXXXXXXX" inputMode="tel" className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3.5 py-3 text-base outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />
        </label>
        <label className="mt-3 flex items-start gap-2.5 text-sm leading-5 text-neutral-700">
          <input type="checkbox" checked={recipientConsent} onChange={(event) => setRecipientConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-orange-500" />
          <span>The person at this number has agreed to receive this one-off test call.</span>
        </label>
        <button type="button" onClick={() => canTest ? void placeTestCall() : onOpenProfile?.()} disabled={placingTest || demo} className="mt-4 w-full rounded-xl bg-neutral-950 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50">
          {placingTest ? "Calling…" : canTest ? "Place one-off test call" : "Connect phone to test"}
        </button>
        {!canTest && !demo && <p className="mt-2 text-xs text-neutral-600">{phoneNumber === "Not assigned" ? "No business phone number is assigned yet. Connect a provider or assign a number in Connections before testing." : config.providerError || "The business phone number must be verified and a receptionist published before testing."}</p>}
        <p className="mt-2 text-xs text-neutral-500">No marketing, scheduled calls or automatic retries are sent from this test control. Provider call charges may apply.</p>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="text-base font-semibold text-neutral-950">Recent calls</h2>
        {loading ? <p className="mt-3 text-sm text-neutral-500">Loading…</p> : calls.length ? (
          <div className="mt-3 divide-y divide-neutral-100">
            {calls.map((call) => (
              <div key={call.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="capitalize text-neutral-600">{call.direction} · {new Date(call.created_at).toLocaleString()}</span>
                <span className="font-medium text-neutral-900">{String(call.status).replace(/_/g, " ")}{call.duration_seconds ? " · " + call.duration_seconds + "s" : ""}</span>
              </div>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-neutral-500">No recorded calls yet.</p>}
      </section>

      {(error || message) && (
        <div className="rounded-xl border border-neutral-200 bg-white p-3.5 text-sm">
          {error && <p role="alert" className="text-red-700">{error}</p>}
          {message && <p role="status" className="text-neutral-800">{message}</p>}
        </div>
      )}

      {(!serverReady || !config.keyConfigured) && !demo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <p className="text-sm text-neutral-700">Phone provider connection needs attention.</p>
          <button type="button" onClick={onOpenProfile} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800">Open connections</button>
        </div>
      )}
      <p className="text-xs text-neutral-500">Status: {loading ? "Checking phone service…" : config.providerConnected === false ? "Provider connection needs attention." : "Live service status is shown from the phone provider."}</p>
    </div>
  );
}
