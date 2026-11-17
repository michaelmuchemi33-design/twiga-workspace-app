import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Message = { id: string; role: "ai" | "user"; text: string };
type Profile = Record<string, any>;

const areas = [
  { key: "identity", label: "Business identity", fields: ["business_name", "business_type"] },
  { key: "description", label: "Business description", fields: ["business_summary", "what_they_do", "what_they_sell"] },
  { key: "catalogue", label: "Products & services", fields: ["products_and_services"] },
  { key: "hours", label: "Opening hours", fields: ["opening_hours"] },
  { key: "booking", label: "Bookings & appointments", fields: ["booking_policy"] },
  { key: "orders", label: "Orders & delivery", fields: ["order_handling", "delivery_and_payment"] },
  { key: "payments", label: "Accepted payment methods", fields: ["payment_channels", "delivery_and_payment"] },
  { key: "support", label: "FAQs & customer support", fields: ["frequently_asked_questions", "support_escalation"] },
  { key: "receptionist", label: "AI receptionist behaviour", fields: ["assistant_instructions", "receptionist_greeting"] },
  { key: "channels", label: "Phone, WhatsApp & contacts", fields: ["call_transfer_number", "whatsapp_number", "contact_email"] },
];

async function edgeFunctionError(error: unknown) {
  const err = error as any;
  const response = err?.context;
  if (response && typeof response.clone === "function") {
    const payload = await response.clone().json().catch(() => null);
    if (payload?.error) return String(payload.error);
    if (payload?.message) return String(payload.message);
  }
  return err?.message || "The request could not be completed.";
}
function valueFor(profile: Profile, area: typeof areas[number]) {
  const details = profile.setup_details || {};
  const values = area.fields.map((field) => {
    const v = field in details ? details[field] : profile[field];
    return Array.isArray(v) ? v.join(", ") : typeof v === "object" && v ? JSON.stringify(v) : String(v || "");
  }).filter(Boolean);
  return values.join(" · ");
}

export default function SetupPage({ demo = false, businessId = "", onDone, onBusinessCreated }: {
  demo?: boolean;
  businessId?: string;
  onDone: () => void;
  onBusinessCreated: (id: string) => void;
}) {
  const [messages, setMessages] = useState<Message[]>([
    { id: "welcome", role: "ai", text: "Hi! I can configure your TWIGA business and AI receptionist. Tell me what your business does, what you offer, your prices and opening hours. I'll organise your services, bookings, orders, FAQs, language, greeting and call-handling rules. I can update the business profile and receptionist settings, but I cannot change your subscription, buy services or make payments." },
  ]);
  const [input, setInput] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [profile, setProfile] = useState<Profile>({});
  const [missing, setMissing] = useState<string[]>(["business name", "business type", "what your business does or sells"]);
  const [ready, setReady] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isEditing = Boolean(businessId);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
  }, [messages, thinking]);

  useEffect(() => {
    if (demo || !supabase) return;
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setOwnerName(String(data.user?.user_metadata?.full_name || data.user?.user_metadata?.name || ""));
      setOwnerEmail(String(data.user?.email || ""));
    });
    return () => { active = false; };
  }, [demo]);

  useEffect(() => {
    if (demo || !supabase || !businessId) return;
    let active = true;
    setLoadingProfile(true);
    void Promise.all([
      supabase.from("businesses").select("name,business_type").eq("id", businessId).maybeSingle(),
      supabase.from("twiga_business_profiles").select("*").eq("business_id", businessId).maybeSingle(),
      supabase.from("twiga_business_settings").select("timezone,business_hours,language_mode").eq("business_id", businessId).maybeSingle(),
    ]).then(([businessResult, profileResult, settingsResult]) => {
      if (!active) return;
      const saved: Profile = profileResult.data || {};
      const business: any = businessResult.data || {};
      const settings: any = settingsResult.data || {};
      const merged: Profile = {
        ...saved,
        business_name: business.name || "",
        business_type: business.business_type || "general",
        business_hours: settings.business_hours || {},
        timezone: settings.timezone || "Africa/Nairobi",
        reply_language: saved.reply_language || settings.language_mode || "match_customer",
        setup_details: saved.setup_details || {},
      };
      setProfile(merged);
      setReady(Boolean(merged.business_name && merged.business_type && (merged.business_summary || merged.what_they_do || merged.what_they_sell || merged.products_and_services)));
      setMissing(["products and prices", "opening hours", "booking rules", "order and delivery process", "FAQs", "receptionist greeting"].filter((x) => {
        const lower = x.toLowerCase();
        return lower.includes("products") ? !merged.products_and_services : lower.includes("opening") ? !merged.opening_hours : lower.includes("booking") ? !merged.setup_details?.booking_policy : lower.includes("order") ? !merged.setup_details?.order_handling : lower.includes("faq") ? !merged.frequently_asked_questions : !merged.receptionist_greeting;
      }));
      if (merged.business_name) setMessages([{ id: "welcome", role: "ai", text: "I have loaded the saved profile for " + merged.business_name + ". Tell me what you want to change or add. I will preserve the details already saved and update only the business and AI settings you discuss. Billing, subscriptions and purchases stay outside my control." }]);
    }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "Could not load the saved business profile."); })
      .finally(() => { if (active) setLoadingProfile(false); });
    return () => { active = false; };
  }, [businessId, demo]);

  const send = async (value?: string) => {
    const text = (value ?? input).trim();
    if (!text || thinking) return;
    if (demo) { setError("Sign in to configure a real business workspace. Sample business data is disabled."); return; }
    if (!supabase || !ownerName.trim() || !ownerEmail.trim()) { setError("Your Google account profile is still loading. Please try again in a moment."); return; }
    const next = [...messages, { id: String(Date.now()), role: "user" as const, text }];
    setMessages(next);
    setInput("");
    setThinking(true);
    setError("");
    setNotice("");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("twiga-setup-assistant", {
        body: {
          messages: next.map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text })),
          ownerProfile: { name: ownerName.trim(), email: ownerEmail.trim() },
          existingProfile: profile,
        },
      });
      if (invokeError) throw new Error(await edgeFunctionError(invokeError));
      if (data?.error) throw new Error(String(data.error));
      setMessages((m) => [...m, { id: String(Date.now() + 1), role: "ai", text: String(data.reply || "Tell me a little more about the business.") }]);
      setProfile((old) => ({ ...old, ...(data.businessProfile || {}), setup_details: { ...(old.setup_details || {}), ...(data.businessProfile?.setup_details || {}) } }));
      setMissing(Array.isArray(data.missingFields) ? data.missingFields : []);
      setReady(data.readyToBuild === true);
      if (data.modelUsed) setNotice("AI response received · " + String(data.modelUsed));
    } catch (e) {
      const message = e instanceof Error ? e.message : "The setup assistant could not reply.";
      setError(message);
      setMessages((m) => [...m, { id: String(Date.now() + 2), role: "ai", text: "I couldn't complete that reply. Your saved details have not been changed. " + message }]);
    } finally { setThinking(false); }
  };

  const buildWorkspace = async () => {
    if (demo) { setError("Sign in to configure a real business workspace."); return; }
    if (!supabase || !ready || !profile.business_name || !ownerName.trim() || !ownerEmail.trim()) return;
    setBuilding(true);
    setError("");
    setNotice("Saving the business profile and AI instructions…");
    try {
      const profileToSave = { ...profile, owner_name: ownerName.trim(), owner_email: ownerEmail.trim() };
      let targetBusinessId = businessId;
      if (isEditing) {
        const { data, error: saveError } = await supabase.functions.invoke("twiga-business-workspaces", {
          body: { action: "update_profile", businessId, profile: profileToSave },
        });
        if (saveError) throw new Error(await edgeFunctionError(saveError));
        if (data?.error) throw new Error(String(data.error));
      } else {
        const { data, error: createError } = await supabase.functions.invoke("twiga-business-workspaces", {
          body: { action: "create", name: profile.business_name, businessType: profile.business_type || "general", profile: profileToSave },
        });
        if (createError) throw new Error(await edgeFunctionError(createError));
        if (data?.error) throw new Error(String(data.error));
        targetBusinessId = String(data?.business?.id || "");
        if (!targetBusinessId) throw new Error("The workspace was not created. Please try again.");
        onBusinessCreated(targetBusinessId);
      }

      let phoneSummary = "No AI phone number is assigned to this business yet. TWIGA needs to assign a number before live calls can be activated.";
      try {
        const { data: config, error: configError } = await supabase.functions.invoke("twiga-sautikit", { body: { action: "get_config", businessId: targetBusinessId } });
        if (configError) throw new Error(await edgeFunctionError(configError));
        if (config?.phoneLine?.line_number) {
          phoneSummary = "TWIGA line on this workspace: " + config.phoneLine.line_number + ".";
          if (!config.keyConfigured) {
            phoneSummary += " The line is recorded in TWIGA, but live provider verification and AI call activation are waiting for TWIGA's central voice connection. You do not need to provide an API key.";
          } else if (config.models?.length) {
            const model = config.models.find((m: any) => m.id === (profile.sautikit_model_id || "sautikit-flash")) || config.models[0];
            const voice = (model.voices || []).includes(profile.sautikit_voice_id || "Woman") ? (profile.sautikit_voice_id || "Woman") : (model.voices || [])[0];
            if (voice) {
              const action = config.agent?.id ? "publish_agent" : "create_agent";
              const body = action === "publish_agent"
                ? { action, businessId: targetBusinessId, model: model.id, voice, corePrompt: String(profile.assistant_instructions || ""), greeting: String(profile.receptionist_greeting || ("Hello, thank you for calling " + profile.business_name + ". How can I help you today?")), inboundPrompt: String(profile.assistant_instructions || "Answer using verified business information and save appointment requests only after consent."), outboundPrompt: String(profile.setup_details?.outbound_call_rules || "Only make authorised callbacks and respect opt-out requests.") }
                : { action, businessId: targetBusinessId, model: model.id, voice };
              const { data: provision, error: provisionError } = await supabase.functions.invoke("twiga-sautikit", { body });
              if (provisionError) throw new Error(await edgeFunctionError(provisionError));
              if (provision?.error) throw new Error(String(provision.error));
              phoneSummary += " AI receptionist agent configured; inbound routing remains in testing until a real incoming call is answered.";
            }
          }
        }
      } catch (phoneError) {
        phoneSummary += " Phone activation needs TWIGA attention: " + (phoneError instanceof Error ? phoneError.message : "provider check failed") + ".";
      }

      setMessages((m) => [...m, { id: String(Date.now()), role: "ai", text: "Your business profile and AI setup instructions have been saved. " + phoneSummary + " Your subscription, payments and purchases have not been changed." }]);
      setNotice("Business profile saved.");
      if (!isEditing) onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the business setup.");
      setNotice("");
    } finally { setBuilding(false); }
  };

  const areaStatus = useMemo(() => areas.map((area) => ({ ...area, value: valueFor(profile, area) })), [profile]);

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">TWIGA · AI business setup</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950">{isEditing ? "Configure your business with AI" : "Build your business workspace"}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-500">One assistant for your business profile, products, services, operating rules and AI receptionist. TWIGA manages provider connections centrally. This assistant cannot change billing, subscriptions, top-ups or purchases.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700">Business owner name<input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoComplete="name" placeholder="Your full name" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 outline-none focus:border-orange-400" /></label>
        <label className="block text-sm font-medium text-neutral-700">Business contact email<input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} autoComplete="email" placeholder="you@business.co.ke" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 outline-none focus:border-orange-400" /></label>
      </div>
    </header>

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4"><div><h2 className="font-semibold text-neutral-950">AI setup assistant</h2><p className="text-xs text-neutral-500">Ask for changes in plain language · English and Kiswahili</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{loadingProfile ? "Loading profile…" : thinking ? "Thinking…" : ready ? "Ready to save" : "Gathering details"}</span></div>
        <div ref={scrollRef} className="max-h-[58vh] min-h-[360px] space-y-4 overflow-y-auto p-5">
          {messages.map((m) => <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[88%] rounded-2xl rounded-br-md bg-neutral-950 px-4 py-3 text-sm leading-6 text-white" : "mr-auto max-w-[92%] rounded-2xl rounded-bl-md bg-neutral-100 px-4 py-3 text-sm leading-6 text-neutral-800"}>{m.text}</div>)}
          {thinking && <div className="mr-auto rounded-2xl bg-neutral-100 px-4 py-3 text-sm text-neutral-500">Checking your business details and preparing the next step…</div>}
        </div>
        <div className="border-t border-neutral-100 p-4">
          <p className="mb-3 text-xs text-neutral-400">Try: “Add my services and prices”, “Change my opening hours”, or “Make the receptionist speak Kiswahili first”.</p>
          <div className="flex items-end gap-2"><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Tell TWIGA what to set up or change…" rows={3} className="min-h-[76px] flex-1 resize-y rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-orange-400" /><button onClick={() => void send()} disabled={thinking || !input.trim() || loadingProfile} className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">Send</button></div>
          <p className="mt-2 text-[11px] text-neutral-400">Enter to send · Shift + Enter for a new line</p>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-neutral-950">10 setup areas</h2><span className="text-xs text-neutral-500">{areaStatus.filter((a) => a.value).length}/10</span></div>
          <div className="mt-4 space-y-3">
            {areaStatus.map((area) => <div key={area.key} className="flex items-start gap-2.5"><span className={"mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold " + (area.value ? "bg-orange-100 text-orange-700" : "bg-neutral-100 text-neutral-400")}>{area.value ? "✓" : "·"}</span><div className="min-w-0"><p className="text-xs font-semibold text-neutral-800">{area.label}</p><p className="mt-0.5 line-clamp-2 text-[11px] text-neutral-500">{area.value || "Not configured yet"}</p></div></div>)}
          </div>
          {missing.length > 0 && <div className="mt-4 rounded-xl bg-neutral-50 p-3"><p className="text-xs font-semibold text-neutral-700">Useful details still missing</p><ul className="mt-2 list-inside list-disc space-y-1 text-xs text-neutral-500">{missing.slice(0,8).map((x) => <li key={x}>{x}</li>)}</ul></div>}
          <button onClick={buildWorkspace} disabled={!ready || building || loadingProfile} className="mt-5 w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{building ? "Saving & configuring…" : isEditing ? "Save business & AI settings" : "Create business workspace"}</button>
          <p className="mt-2 text-[11px] leading-5 text-neutral-400">You can save a first draft when the business name, type and description are ready. Complete the remaining areas later.</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-semibold text-neutral-900">What TWIGA can configure</h3><p className="mt-2 text-xs leading-5 text-neutral-500">Business identity, catalogue, hours, booking rules, order handling, FAQs, language, greetings, inbound/outbound instructions and staff handover.</p><div className="mt-3 rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs leading-5 text-orange-950"><b>Protected area:</b> subscriptions, payments, wallet top-ups, purchases and provider spending stay outside the AI assistant.</div></div>
      </aside>
    </div>
    {notice && <p role="status" className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">{notice}</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  </div>;
}
