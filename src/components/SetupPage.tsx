import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { IconSparkle, IconSend, IconCheck, IconArrowUpRight, IconFile } from "@/components/Icons";

type ChatMessage = { role: "assistant" | "user"; content: string };
type SetupDraft = {
  business_name: string;
  business_type: string;
  business_summary: string;
  what_they_do: string;
  what_they_sell: string;
  products_and_services: string;
  target_customers: string;
  unique_selling_points: string;
  opening_hours: string;
  service_area: string;
  delivery_and_payment: string;
  returns_and_refunds: string;
  frequently_asked_questions: string;
  brand_voice: string;
  reply_language: string;
  receptionist_greeting: string;
  assistant_instructions: string;
  setup_details: Record<string, any>;
};

const blankDraft: SetupDraft = {
  business_name: "",
  business_type: "general",
  business_summary: "",
  what_they_do: "",
  what_they_sell: "",
  products_and_services: "",
  target_customers: "",
  unique_selling_points: "",
  opening_hours: "",
  service_area: "",
  delivery_and_payment: "",
  returns_and_refunds: "",
  frequently_asked_questions: "",
  brand_voice: "Warm, clear, helpful and professional",
  reply_language: "match_customer",
  receptionist_greeting: "",
  assistant_instructions: "",
  setup_details: {},
};

const quickStarts = [
  "I run a salon in Nairobi. We do braids, nails and makeup.",
  "I own a shop. Help me set up sales and WhatsApp enquiries.",
  "I run a restaurant. I want bookings, menu questions and orders handled.",
];

const connectionNames: Record<string, string> = {
  whatsapp: "WhatsApp",
  sautikit: "Business phone",
  palpluss: "M-Pesa & payments",
  aisensy: "WhatsApp campaigns",
  google_calendar: "Google Calendar",
  google_contacts: "Google Contacts",
  google_sheets: "Google Sheets",
  google_drive: "Google Drive",
};

export default function SetupPage({ demo = false, businessId = "", onDone, onBusinessCreated, onOpenConnections }: {
  demo?: boolean;
  businessId?: string;
  onDone: () => void;
  onBusinessCreated: (id: string) => void;
  onOpenConnections?: () => void;
}) {
  const [draft, setDraft] = useState<SetupDraft>(blankDraft);
  const [chat, setChat] = useState<ChatMessage[]>([{
    role: "assistant",
    content: "Hi! I'm TWIGA. Tell me about your business in your own words. What do you do, what do customers usually ask for, and what would you like me to handle? I'll ask one question at a time and build your receptionist setup with you."
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [suggestedConnections, setSuggestedConnections] = useState<string[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (demo || !businessId || !supabase) {
      setProfileLoaded(true);
      return;
    }
    let active = true;
    void Promise.all([
      supabase.from("businesses").select("name,business_type").eq("id", businessId).maybeSingle(),
      supabase.from("twiga_business_profiles").select("*").eq("business_id", businessId).maybeSingle(),
    ]).then(([businessResult, profileResult]) => {
      if (!active) return;
      if (businessResult.error) throw businessResult.error;
      if (profileResult.error) throw profileResult.error;
      const business = businessResult.data || {};
      const profile = profileResult.data || {};
      setDraft((current) => ({
        ...current,
        business_name: String(business.name || profile.business_name || ""),
        business_type: String(business.business_type || profile.business_type || "general"),
        business_summary: String(profile.business_summary || profile.what_they_do || ""),
        what_they_do: String(profile.what_they_do || profile.business_summary || ""),
        what_they_sell: String(profile.what_they_sell || ""),
        products_and_services: String(profile.products_and_services || profile.what_they_sell || ""),
        target_customers: String(profile.target_customers || ""),
        unique_selling_points: String(profile.unique_selling_points || ""),
        opening_hours: String(profile.opening_hours || ""),
        service_area: String(profile.service_area || ""),
        delivery_and_payment: String(profile.delivery_and_payment || ""),
        returns_and_refunds: String(profile.returns_and_refunds || ""),
        frequently_asked_questions: String(profile.frequently_asked_questions || ""),
        brand_voice: String(profile.brand_voice || current.brand_voice),
        reply_language: String(profile.reply_language || current.reply_language),
        receptionist_greeting: String(profile.receptionist_greeting || ""),
        assistant_instructions: String(profile.assistant_instructions || ""),
        setup_details: profile.setup_details && typeof profile.setup_details === "object" ? profile.setup_details : {},
      }));
      setProfileLoaded(true);
    }).catch((cause) => {
      if (active) {
        setError(cause instanceof Error ? cause.message : "Business details could not be loaded.");
        setProfileLoaded(true);
      }
    });
    return () => { active = false; };
  }, [businessId, demo]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({behavior:"smooth",block:"end"});
  }, [chat, loading]);

  const update = (key: keyof SetupDraft, value: string) => {
    setDraft((current) => ({...current,[key]:value}));
    setNotice("");
    setError("");
  };

  const send = async (message?: string) => {
    const value = String(message === undefined ? input : message).trim();
    if (!value || loading || demo) return;
    if (!supabase || !businessId) {
      setError("Your business workspace is not ready. Refresh the page and sign in again.");
      return;
    }
    setInput("");
    setError("");
    setNotice("");
    const nextChat: ChatMessage[] = [...chat,{role:"user",content:value}];
    setChat(nextChat);
    setLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token || "";
      if (!token) throw new Error("Your sign-in has expired. Sign in again.");
      const response = await fetch("https://twiga-api.twiga-ke.workers.dev/ai/setup-chat",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
        body:JSON.stringify({business_id:businessId,token,messages:nextChat,draft:draft}),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) throw new Error(String(result.error || "TWIGA could not respond."));
      const patch = result.patch && typeof result.patch === "object" ? result.patch : {};
      setDraft((current) => ({
        ...current,
        ...patch,
        business_name:String(patch.business_name ?? current.business_name),
        business_type:String(patch.business_type ?? current.business_type),
        setup_details:{...current.setup_details,...(patch.setup_details || {})},
      }));
      setMissingFields(Array.isArray(result.missing_fields) ? result.missing_fields : []);
      setSuggestedConnections(Array.isArray(result.suggested_connections) ? result.suggested_connections : []);
      setChat((current) => [...current,{role:"assistant",content:String(result.reply || "Thanks. Tell me a little more about your business.")}]);
    } catch (cause) {
      setChat((current) => current.slice(0,-1));
      setInput(value);
      setError(cause instanceof Error ? cause.message : "TWIGA could not respond.");
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (demo) {
      setNotice("This is a sample workspace. Your changes are not saved.");
      return;
    }
    if (!supabase || !businessId) {
      setError("Choose or create a business workspace first.");
      return;
    }
    if (draft.business_name.trim().length < 2 || draft.business_summary.trim().length < 5) {
      setError("Tell TWIGA your business name and what your business does first.");
      setShowReview(false);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const {data:authData} = await supabase.auth.getUser();
      const user = authData.user;
      const setupDetails = {
        ...draft.setup_details,
        setup_mode:"conversational",
        requested_connections:suggestedConnections,
        owner_tasks:Array.isArray(draft.setup_details.owner_tasks) ? draft.setup_details.owner_tasks : ["Answer customer questions","Capture orders and booking requests","Notify me when someone needs my attention"],
        configured_at:new Date().toISOString(),
      };
      const profile = {
        ...draft,
        business_name:draft.business_name.trim(),
        business_type:draft.business_type,
        what_they_do:draft.business_summary.trim(),
        business_summary:draft.business_summary.trim(),
        what_they_sell:draft.products_and_services.trim(),
        products_and_services:draft.products_and_services.trim(),
        owner_name:String(user?.user_metadata?.full_name || user?.user_metadata?.name || ""),
        owner_email:String(user?.email || ""),
        timezone:"Africa/Nairobi",
        reply_language:draft.reply_language || "match_customer",
        receptionist_greeting:draft.receptionist_greeting.trim() || "Hello, thank you for contacting " + draft.business_name.trim() + ". How can I help you today?",
        assistant_instructions:draft.assistant_instructions.trim() || [
          "You are the receptionist for " + draft.business_name.trim() + ".",
          "Use only the saved business details, active products, prices and connected TWIGA records.",
          "Reply in the customer's language and keep responses short.",
          "Never invent prices, stock, opening hours, appointment availability, payment status or completed actions.",
          "Create owner tasks whenever a customer request needs a human decision.",
          "Do not request PINs, passwords or OTPs.",
        ].join("\n"),
        setup_details:setupDetails,
      };
      const action = businessId ? "update_profile" : "create";
      const body = action === "create"
        ? {action,name:profile.business_name,businessType:profile.business_type,profile}
        : {action,businessId,profile};
      const {data,error:invokeError} = await supabase.functions.invoke("twiga-business-workspaces",{body});
      if (invokeError) {
        const response = (invokeError as any).context;
        const payload = response && typeof response.clone === "function" ? await response.clone().json().catch(() => null) : null;
        throw new Error(String(payload?.error || invokeError.message));
      }
      if (data?.error) throw new Error(String(data.error));
      if (data?.created && data?.business?.id) onBusinessCreated(String(data.business.id));
      setNotice("Your business profile and AI receptionist instructions have been saved. Choose your connections next.");
      setShowReview(false);
      onDone();
      if (suggestedConnections.length) onOpenConnections?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Business setup could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const connectionLabels = useMemo(() => suggestedConnections.map((key) => connectionNames[key] || key),[suggestedConnections]);
  const fieldClass = "mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100";
  const labelClass = "block text-xs font-semibold text-neutral-700";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">Business & AI setup</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-950">Tell TWIGA about your business</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">Describe your business naturally. TWIGA will ask a few questions, build your receptionist instructions, and show you anything that still needs connecting.</p>
        {demo && <p className="mt-3 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">Sample setup only. Real profiles, keys and connections are disabled in demo mode.</p>}
      </header>

      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-50 text-orange-600"><IconSparkle className="h-4 w-4"/></span>
            <div><p className="text-sm font-semibold text-neutral-950">Your TWIGA setup assistant</p><p className="text-xs text-neutral-500">{profileLoaded ? "Ready to build your business profile" : "Loading your saved business profile…"}</p></div>
          </div>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-600">{chat.filter((item)=>item.role==="user").length} messages</span>
        </div>
        <div className="max-h-[410px] space-y-4 overflow-y-auto px-5 py-5">
          {chat.map((item,index)=><div key={index} className={"flex gap-2.5 "+(item.role==="user"?"justify-end":"justify-start")}>
            {item.role==="assistant" && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-orange-50 text-orange-600"><IconSparkle className="h-4 w-4"/></span>}
            <div className={"max-w-[86%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 "+(item.role==="user"?"bg-neutral-950 text-white":"bg-neutral-50 text-neutral-800")}>{item.content}</div>
          </div>)}
          {loading && <div className="flex items-center gap-2 text-xs text-neutral-500"><span className="h-2 w-2 animate-pulse rounded-full bg-orange-500"/> TWIGA is thinking…</div>}
          <div ref={chatEndRef}/>
        </div>
        {!demo && chat.length <= 1 && <div className="flex flex-wrap gap-2 px-5 pb-3">{quickStarts.map((start)=><button key={start} onClick={()=>void send(start)} className="rounded-full border border-neutral-200 px-3 py-2 text-xs text-neutral-700 transition hover:border-orange-300 hover:bg-orange-50">{start}</button>)}</div>}
        <div className="flex items-end gap-2 border-t border-neutral-100 p-4">
          <textarea value={input} onChange={(event)=>setInput(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void send();}}} rows={2} placeholder="Describe your business, your customers, or what you want TWIGA to handle…" className="min-h-12 flex-1 resize-y rounded-xl border border-neutral-200 px-3 py-3 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100" disabled={demo}/>
          <button type="button" onClick={()=>void send()} disabled={loading||!input.trim()||demo} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-neutral-950 text-white transition hover:bg-neutral-800 disabled:opacity-40"><IconSend className="h-4 w-4"/></button>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold text-neutral-950">Review your business and receptionist</h2><p className="mt-1 text-xs leading-5 text-neutral-500">TWIGA fills these from your conversation. You can edit anything before saving.</p></div>
          <button type="button" onClick={()=>setShowReview((current)=>!current)} className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-800">{showReview?"Hide details":"Review details"}</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className={"rounded-full px-3 py-1 text-xs "+(draft.business_name?"bg-orange-50 text-orange-800":"bg-neutral-100 text-neutral-600")}>{draft.business_name?"Business name added":"Business name needed"}</span>
          <span className={"rounded-full px-3 py-1 text-xs "+(draft.business_summary?"bg-orange-50 text-orange-800":"bg-neutral-100 text-neutral-600")}>{draft.business_summary?"Business description added":"Description needed"}</span>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700">{missingFields.length} follow-up details</span>
        </div>
        {showReview && <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>Business name<input value={draft.business_name} onChange={(event)=>update("business_name",event.target.value)} className={fieldClass} placeholder="Business name"/></label>
          <label className={labelClass}>Business type<select value={draft.business_type} onChange={(event)=>update("business_type",event.target.value)} className={fieldClass}><option value="general">General business</option><option value="salon">Salon</option><option value="barbershop">Barbershop</option><option value="retail">Retail</option><option value="restaurant">Restaurant / café</option><option value="professional_services">Professional services</option><option value="other">Other</option></select></label>
          <label className={labelClass+" sm:col-span-2"}>What your business does<textarea rows={3} value={draft.business_summary} onChange={(event)=>update("business_summary",event.target.value)} className={fieldClass}/></label>
          <label className={labelClass+" sm:col-span-2"}>Products, services and prices<textarea rows={3} value={draft.products_and_services} onChange={(event)=>update("products_and_services",event.target.value)} className={fieldClass}/></label>
          <label className={labelClass}>Opening hours<input value={draft.opening_hours} onChange={(event)=>update("opening_hours",event.target.value)} className={fieldClass}/></label>
          <label className={labelClass}>Location / service area<input value={draft.service_area} onChange={(event)=>update("service_area",event.target.value)} className={fieldClass}/></label>
          <label className={labelClass+" sm:col-span-2"}>Target customers<textarea rows={2} value={draft.target_customers} onChange={(event)=>update("target_customers",event.target.value)} className={fieldClass}/></label>
          <label className={labelClass+" sm:col-span-2"}>Frequently asked questions<textarea rows={3} value={draft.frequently_asked_questions} onChange={(event)=>update("frequently_asked_questions",event.target.value)} className={fieldClass}/></label>
          <label className={labelClass+" sm:col-span-2"}>Payment, delivery and booking policies<textarea rows={3} value={draft.delivery_and_payment} onChange={(event)=>update("delivery_and_payment",event.target.value)} className={fieldClass}/></label>
          <label className={labelClass+" sm:col-span-2"}>Receptionist greeting<input value={draft.receptionist_greeting} onChange={(event)=>update("receptionist_greeting",event.target.value)} className={fieldClass} placeholder="The first thing your receptionist says"/></label>
          <label className={labelClass+" sm:col-span-2"}>AI receptionist instructions / prompt<textarea rows={5} value={draft.assistant_instructions} onChange={(event)=>update("assistant_instructions",event.target.value)} className={fieldClass} placeholder="How TWIGA should answer, what it can do, when it must ask staff, how to handle bookings and orders…"/></label>
          <label className={labelClass}>Language<select value={draft.reply_language} onChange={(event)=>update("reply_language",event.target.value)} className={fieldClass}><option value="match_customer">Match the customer</option><option value="en">English</option><option value="sw">Kiswahili</option><option value="en_sw">English & Kiswahili</option></select></label>
          <label className={labelClass}>Receptionist tone<input value={draft.brand_voice} onChange={(event)=>update("brand_voice",event.target.value)} className={fieldClass}/></label>
        </div>}
        {missingFields.length>0 && <p className="mt-3 text-xs leading-5 text-neutral-500">Still useful to add: {missingFields.join(" · ")}</p>}
        {suggestedConnections.length>0 && <div className="mt-4"><p className="text-xs font-semibold text-neutral-700">Connections suggested from your conversation</p><div className="mt-2 flex flex-wrap gap-2">{connectionLabels.map((label)=> <span key={label} className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1.5 text-xs text-orange-900">{label}</span>)}</div></div>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">{notice}</p>}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
          <p className="max-w-xl text-xs leading-5 text-neutral-500">You never need to paste API keys here. Connect WhatsApp, phone and payments from Connections, or ask the TWIGA administrator to assign a secure provider credential.</p>
          <button type="button" onClick={()=>void save()} disabled={saving||!profileLoaded||demo} className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-40">{saving?"Saving receptionist…":"Save business & AI setup"}</button>
        </div>
        {!demo && <button type="button" onClick={onOpenConnections} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-neutral-700 underline underline-offset-4">Open connections <IconArrowUpRight className="h-3.5 w-3.5"/></button>}
      </section>
    </div>
  );
}
