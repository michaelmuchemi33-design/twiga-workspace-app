import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { IconSparkle, IconSend, IconCheck } from "@/components/Icons";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "assistant" | "user"; content: string };
type ProfileDraft = Record<string, any>;
const API = "https://twiga-api.twiga-ke.workers.dev";

const firstMessage = "Hi! Let’s set up your receptionist. What should TWIGA call your business, and what do customers usually come to you for? We’ll build this together one step at a time.";

export default function SetupPage({ demo = false, onDone }: {
  demo?: boolean;
  businessId?: string;
  onDone: () => void;
  onBusinessCreated: (id: string) => void;
}) {
  const { businessId } = useStore();
  const [messages, setMessages] = useState<ChatMessage[]>([{role:"assistant",content:firstMessage}]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [building, setBuilding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({behavior:"smooth",block:"end"});
  }, [messages, draft]);

  const askTwiga = async (action: "chat" | "build_profile", history: ChatMessage[]) => {
    if (!supabase || !businessId) throw new Error("Choose your business workspace and sign in again.");
    const auth = await supabase.auth.getSession();
    const token = auth.data.session?.access_token || "";
    if (!token) throw new Error("Your sign-in has expired. Sign in again to continue.");
    const response = await fetch(API + "/ai/setup", {
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer " + token},
      body:JSON.stringify({token,business_id:businessId,action,messages:history})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || "TWIGA could not complete that setup step.");
    return data;
  };

  const sendMessage = async (value = input) => {
    const text = value.trim();
    if (!text || sending || demo) return;
    setInput(""); setDraft(null); setError(""); setNotice("");
    const next = [...messages,{role:"user" as const,content:text}];
    setMessages(next); setSending(true);
    try {
      const result = await askTwiga("chat",next);
      setMessages([...next,{role:"assistant",content:String(result.reply || "Tell me a little more about the business.")}]);
    } catch (cause) {
      setMessages(next);
      setInput(text);
      setError(cause instanceof Error ? cause.message : "TWIGA could not reply. Try again.");
    } finally { setSending(false); }
  };

  const buildProfile = async () => {
    if (building || saving || demo) return;
    setBuilding(true); setError(""); setNotice("");
    try {
      const result = await askTwiga("build_profile",messages);
      if (!result.profileDraft || typeof result.profileDraft !== "object") throw new Error("TWIGA did not return a complete profile draft. Add a little more detail and try again.");
      setDraft(result.profileDraft);
      setMessages((current) => [...current,{role:"assistant",content:String(result.reply || "I’ve prepared your receptionist profile. Review the summary below and save it when you’re ready.")}]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not prepare your business profile.");
    } finally { setBuilding(false); }
  };

  const saveProfile = async () => {
    if (!draft || !businessId || !supabase || saving || demo) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const {data:authData} = await supabase.auth.getUser();
      const user = authData.user;
      const profile = {
        ...draft,
        owner_name:String(user?.user_metadata?.full_name || user?.user_metadata?.name || ""),
        owner_email:String(user?.email || ""),
        timezone:"Africa/Nairobi",
        brand_voice:draft.brand_voice || "Warm, clear, helpful and professional",
        reply_language:draft.reply_language || "match_customer",
        assistant_instructions:draft.assistant_instructions || "Act as this business’s receptionist. Use only verified business details, answer in the customer’s language, do not invent prices or availability, and hand requests needing confirmation to the team."
      };
      const {data,error:invokeError} = await supabase.functions.invoke("twiga-business-workspaces",{
        body:{action:"update_profile",businessId,profile}
      });
      if (invokeError) {
        const detail = (invokeError as any)?.context;
        const payload = detail && typeof detail.clone === "function" ? await detail.clone().json().catch(() => null) : null;
        throw new Error(String(payload?.error || invokeError.message || "Business profile could not be saved."));
      }
      if (data?.error) throw new Error(String(data.error));
      setNotice("Your business profile and receptionist instructions are saved.");
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Business profile could not be saved.");
    } finally { setSaving(false); }
  };

  const prompts = [
    "We take bookings and appointments",
    "We sell products and take orders",
    "We deliver and accept M-Pesa",
    "I want SautiKit calls and WhatsApp connected"
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-orange-600">Business setup · AI receptionist</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-950">Tell TWIGA about your business</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-600">Have a normal conversation. TWIGA will ask the useful questions, learn how your business works, and prepare your receptionist instructions.</p>
        </div>
        <Badge className="border-0 bg-orange-50 text-orange-800"><IconSparkle className="mr-1 h-3.5 w-3.5" /> AI setup</Badge>
      </div>

      {demo && <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">Sample setup preview. Real AI configuration and saving are disabled in demo mode.</div>}

      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
          <div><p className="text-sm font-semibold text-neutral-950">Your setup conversation</p><p className="text-xs text-neutral-500">TWIGA · business assistant</p></div>
          <span className="flex items-center gap-1.5 text-xs text-neutral-500"><span className="h-2 w-2 rounded-full bg-orange-500" /> {sending || building ? "Working" : "Ready"}</span>
        </div>
        <div className="max-h-[480px] min-h-[260px] space-y-4 overflow-y-auto bg-neutral-50/70 p-4 sm:p-5">
          {messages.map((item,index) => (
            <div key={index} className={cn("flex",item.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",item.role === "user" ? "rounded-br-md bg-neutral-950 text-white" : "rounded-bl-md border border-neutral-200 bg-white text-neutral-800")}>
                {item.content}
              </div>
            </div>
          ))}
          {(sending || building) && <div className="flex justify-start"><div className="rounded-2xl rounded-bl-md border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-500">{building ? "Preparing your business profile…" : "TWIGA is thinking…"}</div></div>}
          <div ref={endRef} />
        </div>
        <div className="border-t border-neutral-100 bg-white p-3 sm:p-4">
          <div className="flex items-end gap-2">
            <Textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Describe your business, services, prices, or how you work…" rows={2} className="min-h-[54px] resize-y rounded-xl border-neutral-200 text-sm" disabled={demo || sending || building} />
            <Button onClick={() => void sendMessage()} disabled={demo || sending || building || !input.trim()} className="h-[54px] rounded-xl bg-neutral-950 px-4 text-white hover:bg-neutral-800"><IconSend className="h-4 w-4" /><span className="sr-only">Send</span></Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {prompts.map((prompt) => <button type="button" key={prompt} onClick={() => void sendMessage(prompt)} disabled={demo || sending || building} className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 transition hover:border-orange-300 hover:bg-orange-50 disabled:opacity-40">{prompt}</button>)}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs leading-5 text-neutral-500">TWIGA may ask about voice, WhatsApp, bookings, payments, SMS and Google tools. API keys and passwords are never needed in this chat — connect them securely under Connections & permissions.</p>
        <Button onClick={() => void buildProfile()} disabled={demo || building || sending || messages.every((item) => item.role !== "user")} variant="outline" className="rounded-xl border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50">
          <IconSparkle className="mr-2 h-4 w-4 text-orange-500" /> {building ? "Preparing…" : "Build my receptionist"}
        </Button>
      </div>

      {draft && (
        <section className="space-y-3 rounded-2xl border border-orange-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-orange-600">Ready to review</p><h2 className="mt-1 text-lg font-semibold text-neutral-950">{draft.business_name || "Your business"} · receptionist profile</h2></div>
            <Badge className="border-0 bg-orange-50 text-orange-800">Draft</Badge>
          </div>
          <p className="text-sm leading-6 text-neutral-700">{draft.business_summary || draft.what_they_do || "Business summary not supplied yet."}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Products & services",draft.products_and_services || draft.what_they_sell],
              ["Customers",draft.target_customers],
              ["Hours",draft.opening_hours],
              ["Location",draft.service_area],
              ["Payments & delivery",draft.delivery_and_payment],
              ["Receptionist tone",draft.brand_voice]
            ].filter((item) => String(item[1] || "").trim()).map(([label,value]) => <div key={String(label)} className="rounded-xl bg-neutral-50 p-3"><p className="text-xs font-semibold text-neutral-500">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{String(value)}</p></div>)}
          </div>
          {Array.isArray(draft.setup_details?.integration_requests) && draft.setup_details.integration_requests.length > 0 && <p className="text-xs text-neutral-600">Requested connections: {draft.setup_details.integration_requests.map(String).join(", ")}. These will be connected separately in the secure Connections screen.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3">
            <p className="text-xs text-neutral-500">Unknown prices or policies are left blank — TWIGA will not make them up.</p>
            <Button onClick={() => void saveProfile()} disabled={saving || demo} className="rounded-xl bg-orange-500 text-white hover:bg-orange-600"><IconCheck className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save business profile"}</Button>
          </div>
        </section>
      )}

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-sm text-orange-900">{notice}</p>}
    </div>
  );
}
