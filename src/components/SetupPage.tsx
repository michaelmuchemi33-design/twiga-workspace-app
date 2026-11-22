import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import * as XLSX from "xlsx";
import * as mammoth from "mammoth";
import { supabase } from "@/lib/supabase";

(pdfjsLib as any).GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { IconSparkle, IconSend, IconCheck, IconFile, IconClose } from "@/components/Icons";
import { Chat33QuickPublisher } from "@/components/Chat33Gateway";
import BringYourOwnAPI from "@/components/BringYourOwnAPI";
import { cn } from "@/lib/utils";

type ChatMessage = { role: "assistant" | "user"; content: string };
type ProfileDraft = Record<string, any>;
type SetupDocument = { id: string; name: string; contentType: string; fileId: string; extractedText: string; extractionStatus: string; sizeBytes: number };
type SetupConnectionTarget = "openai" | "openrouter" | "xai" | "groq" | "deepseek" | "resend" | "palpluss" | "custom" | "google" | "whatsapp" | "sautikit" | "chat33";
function getSetupConnectionTarget(request: string): SetupConnectionTarget {
  const value = String(request || "").toLowerCase();
  if (/chat33/.test(value)) return "chat33";
  if (/google|calendar|contacts|sheets|drive/.test(value)) return "google";
  if (/sautikit|phone|voice/.test(value)) return "sautikit";
  if (/whatsapp|meta/.test(value)) return "whatsapp";
  if (/openrouter/.test(value)) return "openrouter";
  if (/openai|gpt/.test(value)) return "openai";
  if (/xai|grok/.test(value)) return "xai";
  if (/groq/.test(value)) return "groq";
  if (/deepseek/.test(value)) return "deepseek";
  if (/resend|email/.test(value)) return "resend";
  if (/palpluss|payment/.test(value)) return "palpluss";
  return "custom";
}
const API = "https://twiga-api.twiga-ke.workers.dev";

const firstMessage = "Hi! Let’s set up your receptionist and business workflows. I’ll learn how you operate, identify any external apps or APIs you need, and show a secure connect button here when a service is missing. Never paste API keys or passwords into this chat. What do you sell or do, and what do customers usually come to you for?";

// Worker/model responses are not guaranteed to be plain strings. Never render
// JavaScript's default "[object Object]" representation in the conversation.
function readableText(value: unknown, fallback = "", depth = 0): string {
  if (depth > 5 || value == null) return fallback;
  if (typeof value === "string") {
    const text = value.trim();
    return !text || text === "[object Object]" || text === "[object Array]" ? fallback : text;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return fallback;
  if (Array.isArray(value)) {
    const parts = value.map((item) => readableText(item, "", depth + 1)).filter(Boolean);
    return parts.join("\\n") || fallback;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = ["text", "content", "reply", "message", "response", "output_text", "generated_text", "generation", "answer", "output", "result", "data", "description", "summary"];
    for (const key of keys) {
      if (record[key] !== undefined && record[key] !== value) {
        const text = readableText(record[key], "", depth + 1);
        if (text) return text;
      }
    }
    if (Array.isArray(record.choices)) {
      const text = readableText(record.choices[0], "", depth + 1);
      if (text) return text;
    }
    // Unknown objects are not chat messages. Use the caller's safe fallback.
  }
  return fallback;
}

export default function SetupPage({ demo = false, onDone, onOpenConnections, onOpenCoreConnections }: {
  demo?: boolean;
  businessId?: string;
  onDone: () => void;
  onBusinessCreated: (id: string) => void;
  onOpenConnections: () => void;
  onOpenCoreConnections: () => void;
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
  const [documents, setDocuments] = useState<SetupDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [publisherOpen, setPublisherOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [connectionTarget, setConnectionTarget] = useState<SetupConnectionTarget>("openai");
  const [connectionRequests, setConnectionRequests] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({behavior:"smooth",block:"end"});
  }, [messages, draft]);

  const openConnectionOverlay = (request = "") => {
    setConnectionTarget(getSetupConnectionTarget(request));
    setConnectionOpen(true);
  };
  const openFullConnectionSettings = () => {
    setConnectionOpen(false);
    onOpenConnections();
  };
  const openCoreConnections = () => {
    setConnectionOpen(false);
    onOpenCoreConnections();
  };

  const askTwiga = async (action: "chat" | "build_profile", history: ChatMessage[]) => {
    if (!supabase || !businessId) throw new Error("Choose your business workspace and sign in again.");
    const auth = await supabase.auth.getSession();
    const token = auth.data.session?.access_token || "";
    if (!token) throw new Error("Your sign-in has expired. Sign in again to continue.");
    const response = await fetch(API + "/ai/setup", {
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer " + token},
      body:JSON.stringify({
        token,
        business_id:businessId,
        action,
        messages:history,
        documents:documents.map((document) => ({
          name:document.name,
          contentType:document.contentType,
          extractedText:document.extractedText,
          extractionStatus:document.extractionStatus
        }))
      })
    });
    const raw = await response.text();
    let data: any = {};
    try { data = raw ? JSON.parse(raw) : {}; }
    catch { data = { reply: raw }; }
    if (!response.ok || data.ok === false) {
      const message = readableText(data.error || data.message, "");
      const reference = readableText(data.requestId, "");
      throw new Error([message || `TWIGA Worker request failed (HTTP ${response.status}). Please try again.`, reference ? `Reference: ${reference}` : ""].filter(Boolean).join(" "));
    }
    return data;
  };

  const extractDocumentText = async (file: File) => {
    const extension = file.name.toLowerCase().split(".").pop() || "";
    if (["txt", "csv", "tsv", "md", "json"].includes(extension) || file.type.startsWith("text/")) {
      return { text: (await file.text()).slice(0, 12000), status: "Text extracted" };
    }
    if (["xlsx", "xls"].includes(extension)) {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellText: true, cellDates: true });
      const sheets = workbook.SheetNames.slice(0, 8).map((name) => {
        const sheet = workbook.Sheets[name];
        return "SHEET: " + name + "\n" + XLSX.utils.sheet_to_csv(sheet, { FS: "\t" });
      });
      return { text: sheets.join("\n\n").slice(0, 12000), status: "Spreadsheet tables extracted" };
    }
    if (extension === "docx") {
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return { text: String(result.value || "").slice(0, 12000), status: "Word document text extracted" };
    }
    if (extension === "pdf" || file.type === "application/pdf") {
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 30); pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push("PAGE " + pageNumber + "\n" + content.items.map((item: any) => String(item.str || "")).join(" "));
      }
      const text = pages.join("\n\n").slice(0, 12000);
      return { text, status: text.trim() ? "PDF text extracted" : "PDF stored; no selectable text found (scanned PDFs need OCR)" };
    }
    return { text: "", status: "File stored in Cloudflare; text extraction is not available for this format yet" };
  };

  const uploadDocuments = async (files: FileList | null) => {
    if (!files || !files.length || uploading || demo || !businessId || !supabase) return;
    setUploading(true); setError(""); setNotice("");
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token || "";
      if (!token) throw new Error("Sign in again before uploading business files.");
      const uploaded: SetupDocument[] = [];
      for (const file of Array.from(files).slice(0, 8)) {
        if (file.size > 25 * 1024 * 1024) throw new Error(file.name + " is larger than the 25 MB file limit.");
        const extracted = await extractDocumentText(file);
        const form = new FormData();
        form.append("file", file, file.name);
        const response = await fetch("https://twiga-business-files.twiga-ke.workers.dev/v1/files/" + encodeURIComponent(businessId), {
          method: "POST",
          headers: { Authorization: "Bearer " + token },
          body: form
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.error || payload.uploaded !== true) throw new Error(String(payload.error || ("Could not upload " + file.name + " (HTTP " + response.status + ").")));
        uploaded.push({
          id: crypto.randomUUID(),
          name: file.name,
          contentType: file.type || "application/octet-stream",
          fileId: String(payload.file?.file_id || ""),
          extractedText: extracted.text,
          extractionStatus: extracted.status,
          sizeBytes: Number(payload.file?.size_bytes || file.size)
        });
      }
      setDocuments((current) => [...current, ...uploaded].slice(-8));
      const readableCount = uploaded.filter((item) => item.extractedText.trim()).length;
      setNotice(uploaded.length + " file(s) saved to this business's private Cloudflare storage. " + readableCount + " file(s) have readable text for the setup AI.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Business documents could not be uploaded.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const sendMessage = async (value = input) => {
    const text = value.trim();
    if (!text || sending || demo) return;
    setInput(""); setDraft(null); setError(""); setNotice("");
    const next = [...messages,{role:"user" as const,content:text}];
    setMessages(next); setSending(true);
    try {
      const result = await askTwiga("chat",next);
      const requests = Array.isArray(result.integrationRequests) ? result.integrationRequests.map((item: unknown) => readableText(item, "", 0)).filter(Boolean).slice(0, 12) : [];
      if (requests.length) setConnectionRequests((current) => Array.from(new Set([...current, ...requests])).slice(0, 12));
      setMessages([...next,{role:"assistant",content:readableText(result.reply ?? result.message, "I received an unexpected response format. Please send that message again.")}]);
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
      const requests = Array.isArray(result.profileDraft.setup_details?.integration_requests) ? result.profileDraft.setup_details.integration_requests.map((item: unknown) => readableText(item, "", 0)).filter(Boolean).slice(0, 12) : [];
      if (requests.length) setConnectionRequests((current) => Array.from(new Set([...current, ...requests])).slice(0, 12));
      setDraft(result.profileDraft);
      setMessages((current) => [...current,{role:"assistant",content:readableText(result.reply ?? result.message, "I’ve prepared your receptionist profile. Review the summary below and save it when you’re ready.")}]);
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
      let workerNotice = "Your business profile and receptionist instructions are saved.";
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) throw new Error("Your sign-in session expired.");
        const workerResponse = await fetch(API + "/ai/worker", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
          body: JSON.stringify({ action: "provision", business_id: businessId })
        });
        const workerPayload = await workerResponse.json().catch(() => ({}));
        if (!workerResponse.ok || workerPayload?.ok === false) throw new Error(String(workerPayload?.error || "The business Worker could not be provisioned."));
        workerNotice += " The Cloudflare Business Worker is provisioned and its next daily review is scheduled.";
      } catch (workerError) {
        workerNotice += " Worker setup needs attention: " + (workerError instanceof Error ? workerError.message : "Open Organize to retry provisioning.");
      }
      setNotice(workerNotice);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Business profile could not be saved.");
    } finally { setSaving(false); }
  };

  const prompts = [
    "We take bookings and appointments",
    "We sell products and take orders",
    "We deliver and accept M-Pesa",
    "Help me connect the external apps and APIs we need",
    "I want SautiKit calls and WhatsApp connected"
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-5 text-neutral-900 dark:text-neutral-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-orange-600">Business setup · AI receptionist</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-950 dark:text-neutral-100">Tell TWIGA about your business</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-600 dark:text-neutral-300">Have a normal conversation. TWIGA will ask the useful questions, learn how your business works, and prepare your receptionist instructions.</p>
        </div>
        <Badge className="border-0 bg-orange-50 text-orange-800"><IconSparkle className="mr-1 h-3.5 w-3.5" /> AI setup</Badge>
      </div>

      {demo && <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">Sample setup preview. Real AI configuration and saving are disabled in demo mode.</div>}

      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3 dark:border-neutral-800">
          <div><p className="text-sm font-semibold text-neutral-950 dark:text-neutral-100">Your setup conversation</p><p className="text-xs text-neutral-500 dark:text-neutral-400">TWIGA · business assistant</p></div>
          <span className="flex items-center gap-1.5 text-xs text-neutral-500"><span className="h-2 w-2 rounded-full bg-orange-500" /> {sending || building ? "Working" : "Ready"}</span>
        </div>
        <div className="max-h-[480px] min-h-[260px] space-y-4 overflow-y-auto bg-neutral-50/70 p-4 sm:p-5 dark:bg-neutral-950">
          {messages.map((item,index) => (
            <div key={index} className={cn("flex",item.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",item.role === "user" ? "rounded-br-md bg-neutral-950 text-white" : "rounded-bl-md border border-neutral-200 bg-white text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100")}>
                {item.content}
              </div>
            </div>
          ))}
          {(sending || building) && <div className="flex justify-start"><div className="rounded-2xl rounded-bl-md border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-500">{building ? "Preparing your business profile…" : "TWIGA is thinking…"}</div></div>}
          <div ref={endRef} />
        </div>
        <div className="border-t border-neutral-100 bg-white p-3 sm:p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">Business documents & data</p><p className="text-[11px] text-neutral-500">Upload Excel, CSV, PDF, Word, text, images and PowerPoint. Readable tables/text are sent to setup AI; other supported files are stored privately.</p></div>
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()} disabled={demo || uploading || documents.length >= 8} className="h-9 rounded-lg border-neutral-300 bg-white text-xs text-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"><IconFile className="mr-1.5 h-4 w-4" />{uploading ? "Uploading…" : "Add files"}</Button>
            <input ref={fileRef} type="file" multiple className="hidden" accept=".xlsx,.xls,.csv,.tsv,.pdf,.docx,.txt,.md,.json,.png,.jpg,.jpeg,.webp,.gif,.pptx" onChange={(event) => void uploadDocuments(event.target.files)} />
          </div>
          {documents.length > 0 && <div className="mb-3 flex flex-wrap gap-2">
            {documents.map((document) => <span key={document.id} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200"><IconFile className="h-3.5 w-3.5 shrink-0 text-orange-500" /><span className="min-w-0"><span className="block truncate font-semibold">{document.name}</span><span className="block text-[10px] text-neutral-500">{document.extractionStatus} · {Math.ceil(document.sizeBytes / 1024)} KB</span></span><button type="button" onClick={() => setDocuments((current) => current.filter((item) => item.id !== document.id))} className="rounded p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800" aria-label={"Remove " + document.name}><IconClose className="h-3 w-3" /></button></span>)}
          </div>}
          <div className="flex items-end gap-2">
            <Textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Describe your business, services, prices, or how you work…" rows={2} className="min-h-[54px] resize-y rounded-xl border-neutral-200 text-sm" disabled={demo || sending || building} />
            <Button onClick={() => void sendMessage()} disabled={demo || sending || building || !input.trim()} className="h-[54px] rounded-xl bg-neutral-950 px-4 text-white hover:bg-neutral-800 dark:bg-black dark:text-white"><IconSend className="h-4 w-4" /><span className="sr-only">Send</span></Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {prompts.map((prompt) => <button type="button" key={prompt} onClick={() => void sendMessage(prompt)} disabled={demo || sending || building} className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-600 transition hover:border-orange-300 hover:bg-orange-50 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800">{prompt}</button>)}
          </div>
        </div>
      </section>

      {connectionRequests.length > 0 && <section className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4 dark:border-orange-900 dark:bg-orange-950/20">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300">Services TWIGA identified</p><h2 className="mt-1 text-sm font-semibold text-neutral-950 dark:text-neutral-100">Connect the tools this workflow needs</h2></div><span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-orange-800 dark:bg-neutral-900 dark:text-orange-200">{connectionRequests.length} requested</span></div>
        <div className="mt-3 space-y-2">{connectionRequests.map((request, index) => <div key={request + index} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-200/80 bg-white p-3 dark:border-orange-900 dark:bg-neutral-900"><p className="min-w-0 flex-1 text-sm leading-5 text-neutral-800 dark:text-neutral-200">{request}</p><button type="button" onClick={() => openConnectionOverlay(request)} className="shrink-0 rounded-lg bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950">Connect securely</button></div>)}</div>
        <p className="mt-3 text-[11px] leading-5 text-orange-900/80 dark:text-orange-200/80">API keys and tokens are entered only in the secure form, never in the AI conversation. A saved key is not treated as a working connector until its provider-specific test succeeds.</p>
      </section>}

      <div className="flex justify-center">
        <Button
          type="button"
          onClick={() => setPublisherOpen(true)}
          className="flex h-auto min-h-14 w-full max-w-xl items-center justify-start gap-3 rounded-2xl border border-orange-500 bg-orange-500 px-5 py-3 text-left text-white shadow-sm transition-colors hover:border-orange-600 hover:bg-orange-600"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white">
            <IconSend className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Publish to your socials</span>
            <span className="mt-0.5 block text-xs font-normal text-white/85">Create one post for your connected Chat33 channels</span>
          </span>
        </Button>
      </div>

      <div
        className={publisherOpen ? "fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6" : "hidden"}
        role="dialog"
        aria-modal="true"
        aria-label="Publish to your socials"
        aria-hidden={!publisherOpen}
      >
        <button
          type="button"
          aria-label="Close social publisher"
          onClick={() => setPublisherOpen(false)}
          className="absolute inset-0 bg-neutral-950/70 backdrop-blur-sm"
        />
        <div className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-950">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white">
                <IconSend className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-950 dark:text-neutral-100">Publish to your socials</p>
                <p className="text-xs text-neutral-500">Choose channels, add your media and publish through Chat33</p>
              </div>
            </div>
            <Button type="button" variant="outline" onClick={() => setPublisherOpen(false)} className="shrink-0 rounded-xl border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800">
              <IconClose className="mr-1.5 h-4 w-4" /> Close
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
            <Chat33QuickPublisher compact />
          </div>
        </div>
      </div>

      <div className={connectionOpen ? "fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-5" : "hidden"} role="dialog" aria-modal="true" aria-label="Connect external services" aria-hidden={!connectionOpen}>
        <button type="button" aria-label="Close service connections" onClick={() => setConnectionOpen(false)} className="absolute inset-0 bg-neutral-950/70 backdrop-blur-sm" />
        <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-950">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-orange-600">TWIGA · secure connection</p><h2 className="mt-0.5 text-base font-semibold text-neutral-950 dark:text-neutral-100">Connect an external service</h2><p className="mt-0.5 text-xs text-neutral-500">Credentials go directly to the protected Cloudflare service, not the chat.</p></div>
            <button type="button" onClick={() => setConnectionOpen(false)} className="shrink-0 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">Close</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
            {connectionTarget === "google" || connectionTarget === "whatsapp" || connectionTarget === "sautikit" || connectionTarget === "chat33" ? <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900 dark:bg-orange-950/30"><h3 className="text-sm font-semibold text-orange-950 dark:text-orange-100">{connectionTarget === "google" ? "Google Workspace connection" : connectionTarget === "whatsapp" ? "Official WhatsApp connection" : connectionTarget === "sautikit" ? "SautiKit phone connection" : "Chat33 social accounts"}</h3><p className="mt-2 text-sm leading-6 text-orange-950/90 dark:text-orange-100/90">{connectionTarget === "google" ? "Connect Calendar, Contacts, Sheets and Drive using Google's permission window. TWIGA will show only the permissions requested for your workflows." : connectionTarget === "whatsapp" ? "Official WhatsApp uses Meta's account authorization and phone-number setup. Do not paste a WhatsApp token into a generic API field." : connectionTarget === "sautikit" ? "SautiKit has its own phone account, API access and number-assignment flow." : "Chat33 accounts are connected under The 10 core functions, where you can manage up to three social gateway accounts."}</p><button type="button" onClick={connectionTarget === "chat33" ? openCoreConnections : openFullConnectionSettings} className="mt-3 rounded-lg bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-950">{connectionTarget === "chat33" ? "Open The 10 core functions" : "Open dedicated connection settings"}</button></div> : <BringYourOwnAPI key={connectionTarget} businessId={businessId || ""} defaultProvider={connectionTarget} compact onSaved={() => { setConnectionOpen(false); setConnectionRequests((current) => current.filter((request) => getSetupConnectionTarget(request) !== connectionTarget)); setNotice("The service connection was saved. Check its verified status before using it in a workflow."); }} />}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs leading-5 text-neutral-500 dark:text-neutral-400">TWIGA will identify the apps and API keys required for the workflows you describe, then prompt you to connect each missing provider through secure forms. Never send keys or PINs in the chat.</p>
        <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => openConnectionOverlay()} disabled={demo || !businessId} variant="outline" className="rounded-xl border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100">Connect services & API keys</Button>
        <Button onClick={() => void buildProfile()} disabled={demo || building || sending || uploading || (messages.every((item) => item.role !== "user") && documents.length === 0)} variant="outline" className="rounded-xl border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50">
          <IconSparkle className="mr-2 h-4 w-4 text-orange-500" /> {building ? "Preparing…" : "Build my receptionist"}
        </Button>
        </div>
      </div>

      {draft && (
        <section className="space-y-3 rounded-2xl border border-orange-200 bg-white p-4 shadow-sm sm:p-5 dark:border-orange-900 dark:bg-neutral-900">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-orange-600">Ready to review</p><h2 className="mt-1 text-lg font-semibold text-neutral-950 dark:text-neutral-100">{draft.business_name || "Your business"} · receptionist profile</h2></div>
            <Badge className="border-0 bg-orange-50 text-orange-800">Draft</Badge>
          </div>
          <p className="text-sm leading-6 text-neutral-700 dark:text-neutral-300">{draft.business_summary || draft.what_they_do || "Business summary not supplied yet."}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Products & services",draft.products_and_services || draft.what_they_sell],
              ["Customers",draft.target_customers],
              ["Hours",draft.opening_hours],
              ["Location",draft.service_area],
              ["Payments & delivery",draft.delivery_and_payment],
              ["Receptionist tone",draft.brand_voice]
            ].filter((item) => String(item[1] || "").trim()).map(([label,value]) => <div key={String(label)} className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800"><p className="text-xs font-semibold text-neutral-500">{label}</p><p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800 dark:text-neutral-200">{readableText(value)}</p></div>)}
          </div>
          {Array.isArray(draft.setup_details?.workflow_requests) && draft.setup_details.workflow_requests.length > 0 && <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700"><p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{draft.setup_details.workflow_requests.length} workflows mapped for this business</p><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5 text-neutral-600 dark:text-neutral-300">{draft.setup_details.workflow_requests.slice(0,12).map((value: unknown, index: number) => <li key={index}>{readableText(value)}</li>)}</ul><p className="mt-2 text-[11px] text-neutral-500">These are planned workflows, not a claim that every provider action is already deployed.</p></div>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Unknown prices or policies are left blank — TWIGA will not make them up.</p>
            <Button onClick={() => void saveProfile()} disabled={saving || demo} className="rounded-xl bg-orange-500 text-white hover:bg-orange-600"><IconCheck className="mr-2 h-4 w-4" />{saving ? "Saving…" : "Save business profile"}</Button>
          </div>
        </section>
      )}

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-sm text-orange-900">{notice}</p>}
    </div>
  );
}
