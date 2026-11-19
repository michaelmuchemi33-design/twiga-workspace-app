import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import ApprovalInbox from "@/components/ApprovalInbox";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { IconSparkle, IconPaperclip, IconSend, IconFile } from "@/components/Icons";

type Message = { id: string; role: "ai" | "user"; text: string };
type Profile = Record<string, any>;
type BusinessFile = { file_id: string; name: string; content_type: string; size_bytes: number; created_at: string };
type UploadedFileContext = { name: string; contentType: string; content: string; note?: string };
const BUSINESS_FILES_API = "https://twiga-business-files.twiga-ke.workers.dev/v1";
const TWIGA_API_URL = import.meta.env.VITE_TWIGA_API_URL || "https://twiga-api.twiga-ke.workers.dev";
const formatFileSize = (bytes: number) => bytes < 1024 ? bytes + " B" : bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + " KB" : (bytes / (1024 * 1024)).toFixed(1) + " MB";
GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

async function extractPdfText(file: File, maxChars: number) {
  const document = await getDocument({ data: await file.arrayBuffer(), isEvalSupported: false }).promise;
  const pageCount = document.numPages;
  const pagesToRead = Math.min(pageCount, 40);
  const chunks: string[] = [];
  let size = 0;
  try {
    for (let pageNumber = 1; pageNumber <= pagesToRead && size < maxChars; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items.map((item: any) => typeof item.str === "string" ? item.str : "").filter(Boolean).join(" ");
      if (text) {
        const chunk = text.slice(0, maxChars - size);
        chunks.push("[PDF page " + pageNumber + "] " + chunk);
        size += chunk.length;
      }
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
  return { text: chunks.join("\\n"), pageCount, pagesRead: pagesToRead };
}

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
  { key: "operations", label: "Industry operating playbook", fields: ["operating_playbook"] },
  { key: "journey", label: "Customer journey", fields: ["customer_journey"] },
  { key: "decisions", label: "AI decisions & approval rules", fields: ["action_approval_matrix", "decision_policy"] },
  { key: "followups", label: "Follow-up automation playbook", fields: ["followup_playbook"] },
  { key: "tasks", label: "Initial staff tasks", fields: ["initial_task_templates"] },
  { key: "integrations", label: "Integration readiness plan", fields: ["integration_plan"] },
];

const fullSetupBrief = "TWIGA — COMPLETE BUSINESS OPERATING SYSTEM & AI RECEPTIONIST SETUP\nRead this entire brief as one instruction. Use every business fact supplied below and all confirmed facts already saved in this workspace. Do not make me repeat information. Configure a complete first draft across all relevant TWIGA areas, not just a telephone greeting.\n\n1) BUSINESS IDENTITY\nTrading name: [BUSINESS NAME]\nLegal name (if different): [LEGAL NAME]\nIndustry and specific niche: [INDUSTRY / NICHE]\nBusiness model: [RETAIL / WHOLESALE / SERVICE / APPOINTMENT / E-COMMERCE / B2B / B2C / OTHER]\nBranches, location and service area: [LOCATIONS]\nWebsite, public email and public contact numbers: [CONTACTS]\nOwner, manager and staff roles: [TEAM / RESPONSIBILITIES]\n\n2) WHAT THE BUSINESS DOES\nBusiness description and value proposition: [DESCRIPTION]\nIdeal customers, customer segments and common needs: [CUSTOMERS]\nProducts and services, SKUs, variants, prices, durations, stock/availability and options: [CATALOGUE]\nOpening hours, holidays, busy periods and time zone: [HOURS]\nCompetitors or differentiators, if known: [DIFFERENTIATORS]\n\n3) HOW WORK REALLY HAPPENS\nExplain the real workflow from first enquiry to completed sale/service: [ENQUIRY → QUALIFICATION → QUOTE → BOOKING / ORDER → CONFIRMATION → FULFILMENT → PAYMENT → AFTERCARE]\nHow staff check stock, capacity, calendars, service areas and prices: [CHECKS]\nHow bookings, deposits, cancellations, rescheduling, no-shows and waitlists work: [BOOKING RULES]\nHow quotes, orders, approvals, delivery, collection, returns and warranties work: [ORDER RULES]\nPayment methods and exact public Till/Paybill/Paylink details if applicable: [PAYMENT METHODS]\nFAQs, complaints, refunds, warranties, escalation, emergencies and unavailable-service handling: [SUPPORT RULES]\n\n4) RECEPTIONIST AND CUSTOMER COMMUNICATION\nGreeting, tone, pronunciation, brand voice and languages: [VOICE / LANGUAGES]\nHow to answer inbound calls, identify the caller's need, qualify leads and capture details: [CALL FLOW]\nWhen to transfer to a named staff member or create a staff task: [HANDOVER]\nWhat can be answered from verified business facts and what must be checked by staff: [ANSWER BOUNDARIES]\nWhatsApp, SMS, email and social channels, including opt-in rules: [CHANNELS]\nWords, promises, medical/legal/financial claims or commitments the AI must never make: [RESTRICTIONS]\n\n5) INDUSTRY OPERATING PLAYBOOK\nBuild a playbook that fits the actual industry, not a generic salon/shop script. Consider the relevant workflows for this business: lead intake, product/service questions, pricing, stock or capacity checks, quotations, appointments, orders, dispatch/delivery, customer updates, complaints, returns, after-sales service and repeat purchases. For regulated or safety-critical sectors, route professional decisions to qualified staff and do not improvise advice.\n\n6) AI DECISION RIGHTS — SEPARATE AUTONOMY FROM APPROVAL\nCreate three groups. A: the AI may do automatically using verified information: answer FAQs, capture a lead, record an enquiry, create internal tasks, draft recommendations and save an order/booking request as pending confirmation. B: require owner/manager approval before acting: customer callbacks, outbound messages, campaigns, price or discount changes, refunds, cancellations with financial impact, supplier commitments, exceptions and externally visible promises not already authorised. C: never do autonomously: make/receive payments, initiate refunds/payouts/top-ups/purchases, change subscriptions, disclose secrets, bypass access controls, invent stock/prices or give regulated professional advice.\nA customer callback requires BOTH explicit customer consent (confirmed phone number and agreed future time) AND the configured business approval. A missed call, an existing customer record or merely sharing a phone number is not consent. Default to owner approval. Do not enable automatic callbacks unless I explicitly switch that on.\n\n7) FOLLOW-UP AND OUTREACH PLAYBOOK\nRecommend relevant workflows for missed calls, new leads, unaccepted quotes, incomplete bookings, appointment reminders, no-shows, order status, delivery, unpaid invoices, post-service feedback, complaints and win-back. For each specify trigger, delay, channel, purpose, consent/opt-in requirement, approval requirement, calling window, retry limit and stop conditions. Respect opt-outs, quiet hours and local rules. Do not launch campaigns or place calls during setup.\n\n8) STAFF TASKS AND DAILY OPERATIONS\nCreate 3–7 useful, specific onboarding tasks for this business. Include title, description, category, priority, suggested owner role and due timing. Recommend recurring daily/weekly tasks where relevant: opening checks, missed-call review, lead follow-up, booking confirmation, stock checks, order dispatch, payment reconciliation, customer care and end-of-day reporting. These tasks must appear in TWIGA Organize after I save the setup. Mark them open/proposed, never completed.\n\n9) USE THE REST OF TWIGA\nRecommend and configure only relevant modules: AI phone receptionist, call testing, inbound/outbound permissions, appointments, CRM/customers, orders, product catalogue, POS, inventory, WhatsApp inbox, SMS, tasks/approvals, analytics, reports, Google Calendar, Contacts, Sheets and Drive, PalPluss payment collection and business-specific integrations. Identify each integration as required, optional or not relevant. Never say connected until TWIGA/provider verification succeeds. Store business records only in this business workspace; keep demo/sample records separate.\n\n10) FINAL OUTPUT AND SAVE\nReturn a complete structured first draft for all 16 setup areas, including the industry playbook, receptionist greeting and instructions, decision/approval matrix, follow-up playbook, task templates and integration readiness plan. Preserve known facts and mark unknown items 'to confirm'; do not invent data. Ask one important question at a time only when necessary. Save a useful first draft as soon as business name, industry and what it does are clear. On save, add recommended tasks to Organize. Do not initiate customer calls, bulk messages, payment prompts, refunds, purchases or subscription changes during setup. Never ask me to paste an API key, OAuth secret, Base64 credential, password, PIN or OTP into this business profile or setup chat; those belong only in secure Connections fields.\n\nBUSINESS DETAILS\nBusiness name: [BUSINESS NAME]\nIndustry: [INDUSTRY]\nLocation: [LOCATION]\nDescription: [DESCRIPTION]\nProducts/services/prices: [CATALOGUE]\nHours: [HOURS]\nStaff/handover: [TEAM]\nBooking/order/payment rules: [RULES]\nGreeting/languages: [VOICE]\nAnything else: [OTHER DETAILS]";

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
    { id: "welcome", role: "ai", text: "Hi! I'm TWIGA Business Setup AI. I help you configure the AI receptionist and operating system that will serve your customers — enquiries, products, bookings, orders, follow-ups and staff handover. Tell me how your business works, and I'll prepare a business-specific setup draft. Any paid service, phone-number purchase, customer charge, subscription, refund or provider-wallet spend must show its exact price and terms and wait for your explicit approval." },
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
  const [aiServiceStatus, setAiServiceStatus] = useState<"checking" | "ready" | "offline" | "demo">("checking");
  const [aiServiceModel, setAiServiceModel] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pendingFileContext, setPendingFileContext] = useState<UploadedFileContext[]>([]);
  const [businessFiles, setBusinessFiles] = useState<BusinessFile[]>([]);
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [storageQuotaBytes, setStorageQuotaBytes] = useState(500 * 1024 * 1024);
  const [d1StorageUsedBytes, setD1StorageUsedBytes] = useState(0);
  const [d1StorageQuotaBytes, setD1StorageQuotaBytes] = useState(500 * 1024 * 1024);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [fileMessage, setFileMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(businessId);

  const refreshBusinessFiles = useCallback(async () => {
    if (demo || !businessId || !supabase) { setBusinessFiles([]); setStorageUsedBytes(0); setD1StorageUsedBytes(0); return; }
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new Error("Sign in again to access business files.");
    const response = await fetch(`${BUSINESS_FILES_API}/usage/${encodeURIComponent(businessId)}`, { headers: { Authorization: `Bearer ${data.session.access_token}` } });
    if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || "Could not load business storage usage."); }
    const usage = await response.json();
    setD1StorageUsedBytes(Number(usage.d1UsedBytes || 0));
    setD1StorageQuotaBytes(Number(usage.d1QuotaBytes || 500 * 1024 * 1024));
    const listResponse = await fetch(`${BUSINESS_FILES_API}/files/${encodeURIComponent(businessId)}`, { headers: { Authorization: `Bearer ${data.session.access_token}` } });
    const result = await listResponse.json().catch(() => ({}));
    if (!listResponse.ok) throw new Error(result.error || "Could not load business files.");
    setBusinessFiles(Array.isArray(result.files) ? result.files : []);
    setStorageUsedBytes(Number(result.usedBytes ?? usage.usedBytes ?? 0));
    setStorageQuotaBytes(Number(result.quotaBytes ?? usage.quotaBytes ?? 500 * 1024 * 1024));
    return;
  }, [businessId, demo]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
  }, [messages, thinking]);

  useEffect(() => {
    void refreshBusinessFiles().catch((e) => setFileMessage(e instanceof Error ? e.message : "Business files could not be loaded."));
  }, [refreshBusinessFiles]);

  useEffect(() => {
    if (demo) { setAiServiceStatus("demo"); return; }
    let active = true;
    setAiServiceStatus("checking");
    fetch(TWIGA_API_URL.replace(/\/$/, "") + "/ai/status", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.ok !== true) throw new Error("Worker health check failed");
        if (!active) return;
        setAiServiceModel(String(result.model || ""));
        setAiServiceStatus(result.configured === true ? "ready" : "offline");
      })
      .catch(() => { if (active) setAiServiceStatus("offline"); });
    return () => { active = false; };
  }, [demo]);

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
      if (merged.business_name) setMessages([{ id: "welcome", role: "ai", text: "I've loaded " + merged.business_name + "'s saved workspace. Tell me what you want done in plain language. I can update verified business details and prepare operational plans. Paid actions remain locked until a verified provider integration presents the exact amount and terms for your approval." }]);
    }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "Could not load the saved business profile."); })
      .finally(() => { if (active) setLoadingProfile(false); });
    return () => { active = false; };
  }, [businessId, demo]);

  const send = async (value?: string) => {
    const text = (value ?? input).trim();
    const attachments = [...selectedFiles];
    if ((!text && !attachments.length && !pendingFileContext.length) || thinking) return;
    if (!demo && (!supabase || !ownerName.trim() || !ownerEmail.trim())) { setError("Your account profile is still loading. Please try again in a moment."); return; }
    if (!demo && attachments.length && !businessId) { setError("Save your business workspace first, then upload its documents."); return; }
    if (attachments.length + pendingFileContext.length > 8) { setError("Upload up to 8 files in one setup request."); return; }
    setThinking(true);
    setUploadingFiles(attachments.length > 0);
    setError("");
    setNotice("");
    setFileMessage("");
    let uploadedFiles = [...pendingFileContext];
    try {
      if (demo && attachments.length) {
        let remainingDemoText = 10000;
        for (const file of attachments) {
          if (!file.size || file.size > 25 * 1024 * 1024) throw new Error(file.name + " must be between 1 byte and 25 MB.");
          const extension = file.name.split(".").pop()?.toLowerCase() || "";
          let content = "";
          let note = "This file is available only for this demo conversation; it is not saved to a customer workspace.";
          if (extension === "pdf" && remainingDemoText > 0) {
            try {
              const extracted = await extractPdfText(file, Math.min(6000, remainingDemoText));
              content = extracted.text;
              remainingDemoText -= content.length;
              note = content ? "Selectable PDF text extracted for this demo conversation." : "No selectable text found; this may be a scanned PDF and OCR is not available in this demo.";
            } catch (e) { note = "PDF could not be read in this browser: " + (e instanceof Error ? e.message : "unsupported PDF"); }
          } else if (["txt", "csv", "md", "json"].includes(extension) && remainingDemoText > 0) {
            content = (await file.text()).slice(0, Math.min(4000, remainingDemoText));
            remainingDemoText -= content.length;
          }
          uploadedFiles.push({ name: file.name, contentType: file.type || (extension === "pdf" ? "application/pdf" : "text/plain"), content, note });
        }
        setSelectedFiles([]);
        setPendingFileContext([...uploadedFiles]);
        setFileMessage("Demo files were read locally for this conversation only. Sign in to save files to a private business workspace.");
      } else if (attachments.length) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (sessionError || !token) throw new Error("Sign in again before uploading business files.");
        const fallbackTypes: Record<string, string> = {
          txt: "text/plain", csv: "text/csv", md: "text/plain", json: "text/plain",
          pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
          webp: "image/webp", gif: "image/gif",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        };
        let remainingText = 12000;
        for (let index = 0; index < attachments.length; index++) {
          const file = attachments[index];
          if (!file.size || file.size > 25 * 1024 * 1024) throw new Error(file.name + " must be between 1 byte and 25 MB.");
          const extension = file.name.split(".").pop()?.toLowerCase() || "";
          const contentType = ["md", "json"].includes(extension) ? "text/plain" : (fallbackTypes[extension] || file.type || "application/octet-stream");
          const uploadFile = new File([file], file.name, { type: contentType });
          const form = new FormData();
          form.append("file", uploadFile, file.name);
          const response = await fetch(`${BUSINESS_FILES_API}/files/${encodeURIComponent(businessId)}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || ("Could not upload " + file.name + "."));
          const readable = ["txt", "csv", "md", "json"].includes(extension) || ["text/plain", "text/csv"].includes(contentType);
          let content = "";
          let note = "";
          if (readable && remainingText > 0) {
            content = (await file.text()).slice(0, Math.min(4000, remainingText));
            remainingText -= content.length;
          } else if (extension === "pdf" && remainingText > 0) {
            try {
              const extracted = await extractPdfText(file, Math.min(6000, remainingText));
              content = extracted.text;
              remainingText -= content.length;
              note = content
                ? "PDF text extracted from " + extracted.pagesRead + " of " + extracted.pageCount + " pages. The original PDF is also stored privately."
                : "PDF stored privately, but no selectable text was found. It may be a scanned document; do not infer its contents.";
            } catch (pdfError) {
              note = "PDF stored privately, but text extraction failed: " + (pdfError instanceof Error ? pdfError.message.slice(0, 220) : "unsupported or damaged PDF") + ".";
            }
          } else {
            note = "Stored in the business workspace. Text extraction is not available for this format yet; do not infer its contents.";
          }
          uploadedFiles.push({ name: file.name, contentType, content, note });
          setPendingFileContext([...uploadedFiles]);
          setSelectedFiles(attachments.slice(index + 1));
        }
        setSelectedFiles([]);
        setUploadingFiles(false);
        await refreshBusinessFiles().catch((e) => setFileMessage(e instanceof Error ? e.message : "Files uploaded, but the file list could not refresh."));
      }
      const userText = text || "Please review the uploaded business files and use their readable details to build or update my business profile.";
      const fileNames = uploadedFiles.length ? "\nFiles: " + uploadedFiles.map((file) => file.name).join(", ") : "";
      const next = [...messages, { id: String(Date.now()), role: "user" as const, text: userText + fileNames }];
      setMessages(next);
      setInput("");
      let data: any;
      const conversation = next.map((m) => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }));
      if (demo) {
        const response = await fetch(TWIGA_API_URL.replace(/\\/$/, "") + "/ai/demo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: conversation, uploadedFiles }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.ok !== true) throw new Error(String(result?.error || "The live TWIGA demo assistant is temporarily unavailable."));
        data = { reply: result.reply, model: result.model, source: result.source };
      } else if (businessId) {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (sessionError || !token) throw new Error("Sign in again to use the Cloudflare AI command centre.");
        const response = await fetch(TWIGA_API_URL.replace(/\/$/, "") + "/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ token, business_id: businessId, messages: conversation, uploadedFiles }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.ok !== true) throw new Error(String(result?.error || "The Cloudflare AI service could not complete this request."));
        data = { reply: result.reply, modelUsed: result.model, businessProfile: profile, missingFields: missing, readyToBuild: ready, source: result.source };
      } else {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (sessionError || !token) throw new Error("Sign in again to configure your business AI.");
        const response = await fetch(TWIGA_API_URL.replace(/\/$/, "") + "/ai/setup", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({
            token,
            messages: conversation,
            ownerProfile: { name: ownerName.trim(), email: ownerEmail.trim() },
            existingProfile: profile,
            uploadedFiles,
          }),
        });
        const setupData = await response.json().catch(() => ({}));
        if (!response.ok || setupData?.ok !== true) throw new Error(String(setupData?.error || "Cloudflare Workers AI could not complete the setup draft."));
        data = setupData;
      }
      setMessages((m) => [...m, { id: String(Date.now() + 1), role: "ai", text: String(data.reply || "Tell me a little more about the business.") }]);
      if (!demo) setProfile((old) => ({ ...old, ...(data.businessProfile || {}), setup_details: { ...(old.setup_details || {}), ...(data.businessProfile?.setup_details || {}) } }));
      setMissing(Array.isArray(data.missingFields) ? data.missingFields : []);
      if (!demo) setReady(data.readyToBuild === true);
      if (uploadedFiles.length) {
        const readableCount = uploadedFiles.filter((file) => file.content).length;
        setNotice(demo ? "The live demo AI read " + readableCount + " uploaded file(s) for this conversation. Demo uploads are not retained." : uploadedFiles.length + " file(s) saved. The AI read " + readableCount + " file(s), including selectable PDF text where available. Scanned PDFs and unsupported formats are stored privately but still need OCR or a compatible reader.");
      } else if (data.modelUsed || data.model) setNotice("AI response received · " + String(data.modelUsed || data.model));
      setPendingFileContext([]);
    } catch (e) {
      const message = e instanceof Error ? e.message : "The setup assistant could not reply.";
      setError(message);
      setMessages((m) => [...m, { id: String(Date.now() + 2), role: "ai", text: "I couldn't complete that reply. Your saved details have not been changed. " + message }]);
      if (uploadedFiles.length) setFileMessage("Your uploaded files are saved. You can retry the AI update without uploading them again.");
    } finally { setThinking(false); setUploadingFiles(false); }
  };

  const downloadBusinessFile = async (file: BusinessFile) => {
    if (!supabase || !businessId) return;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sign in again to download this file.");
      const response = await fetch(`${BUSINESS_FILES_API}/files/${encodeURIComponent(businessId)}/${encodeURIComponent(file.file_id)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Could not download this file.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url; link.download = file.name; document.body.appendChild(link); link.click(); link.remove();
      URL.revokeObjectURL(url);
    } catch (e) { setFileMessage(e instanceof Error ? e.message : "Could not download this file."); }
  };

  const deleteBusinessFile = async (file: BusinessFile) => {
    if (!supabase || !businessId || !window.confirm("Delete " + file.name + " from this business workspace?")) return;
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sign in again to manage business files.");
      const response = await fetch(`${BUSINESS_FILES_API}/files/${encodeURIComponent(businessId)}/${encodeURIComponent(file.file_id)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not delete this file.");
      await refreshBusinessFiles();
      setFileMessage("File deleted from this business workspace.");
    } catch (e) { setFileMessage(e instanceof Error ? e.message : "Could not delete this file."); }
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
      let setupTaskCount = 0;
      if (isEditing) {
        const { data, error: saveError } = await supabase.functions.invoke("twiga-business-workspaces", {
          body: { action: "update_profile", businessId, profile: profileToSave },
        });
        if (saveError) throw new Error(await edgeFunctionError(saveError));
        if (data?.error) throw new Error(String(data.error));
        setupTaskCount = Number(data?.setupTasks?.created || 0);
      } else {
        const { data, error: createError } = await supabase.functions.invoke("twiga-business-workspaces", {
          body: { action: "create", name: profile.business_name, businessType: profile.business_type || "general", profile: profileToSave },
        });
        if (createError) throw new Error(await edgeFunctionError(createError));
        if (data?.error) throw new Error(String(data.error));
        setupTaskCount = Number(data?.setupTasks?.created || 0);
        targetBusinessId = String(data?.business?.id || "");
        if (!targetBusinessId) throw new Error("The workspace was not created. Please try again.");
        onBusinessCreated(targetBusinessId);
      }

      let phoneSummary = "The business profile and operating instructions are saved. TWIGA manages the shared phone connection; each business still needs its own assigned phone number and dedicated receptionist agent.";
      try {
        const { data: config, error: configError } = await supabase.functions.invoke("twiga-sautikit", { body: { action: "get_config", businessId: targetBusinessId } });
        if (configError) throw new Error(await edgeFunctionError(configError));
        if (config?.phoneLine?.line_number) {
          phoneSummary = "TWIGA line on this workspace: " + config.phoneLine.line_number + ".";
          if (!config.keyConfigured) {
            phoneSummary += " The line is recorded, but TWIGA's shared phone connection is not available yet. The platform administrator must connect it; business customers do not enter provider API keys.";
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
              if (action === "create_agent" && provision?.bound !== true) {
                throw new Error(String(provision?.message || "The phone service created the receptionist but did not confirm the phone-number binding. Do not create another agent; use Retry inbound binding."));
              }
              if (action === "publish_agent" && provision?.published !== true) {
                throw new Error(String(provision?.message || "The phone service did not confirm that the existing receptionist was published."));
              }
              phoneSummary += " TWIGA confirmed the dedicated receptionist agent and its existing number binding. Your current inbound route was preserved; test a real incoming call and confirm catalogue lookup before going live.";
            }
          }
        } else if (config?.keyConfigured) {
          phoneSummary = Array.isArray(config.availableNumbers) && config.availableNumbers.length > 0
            ? "TWIGA's phone connection is ready and this workspace has " + config.availableNumbers.length + " available number(s). A TWIGA platform administrator must assign a dedicated number to this business before creating its receptionist."
            : "TWIGA's phone connection is ready, but this business has no assigned phone number. A TWIGA platform administrator must allocate a number before the AI receptionist can be created.";
        }
      } catch (phoneError) {
        phoneSummary += " Phone activation needs TWIGA attention: " + (phoneError instanceof Error ? phoneError.message : "provider check failed") + ".";
      }

      const taskSummary = setupTaskCount > 0
        ? " " + setupTaskCount + " onboarding task(s) were added to Organize."
        : " No new onboarding tasks were created (there may be no task templates yet, or they were already added).";
      setMessages((m) => [...m, { id: String(Date.now()), role: "ai", text: "Your business profile and AI setup instructions have been saved." + taskSummary + " " + phoneSummary.replace(/SautiKit/gi, "phone service") + " Your subscription, payments and purchases have not been changed." }]);
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
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-500">TWIGA · AI Desk</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950">{isEditing ? "Manage your business with AI" : "Start with your AI business assistant"}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">Use this as your business command centre: ask for setup changes, operational plans, service comparisons and customer workflows in normal language. Once a workspace is selected, operational chats run through the authenticated Cloudflare Worker with this business’s own profile, catalogue and recent activity. Paid actions must show verified provider, recipient, amount and terms, then wait for your approval.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-neutral-700">Business owner name<input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} autoComplete="name" placeholder="Your full name" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 outline-none focus:border-orange-400" /></label>
        <label className="block text-sm font-medium text-neutral-700">Business contact email<input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} autoComplete="email" placeholder="you@business.co.ke" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 outline-none focus:border-orange-400" /></label>
      </div>
    </header>

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span className={"h-2.5 w-2.5 rounded-full " + (aiServiceStatus === "ready" ? "bg-emerald-500" : aiServiceStatus === "offline" ? "bg-red-500" : "bg-neutral-400")} />
        <div>
          <p className="text-sm font-semibold text-neutral-900">Cloudflare AI service</p>
          <p className="text-xs text-neutral-500">{aiServiceStatus === "ready" ? "Cloudflare Workers AI connected · no external model key required" : aiServiceStatus === "offline" ? "Worker could not be reached or AI binding is unavailable" : aiServiceStatus === "demo" ? "Demo preview · no live AI requests" : "Checking Worker and model configuration…"}</p>
        </div>
      </div>
      {aiServiceModel && aiServiceStatus === "ready" && <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">{aiServiceModel}</span>}
      <button type="button" onClick={() => { setAiServiceStatus("checking"); fetch(TWIGA_API_URL.replace(/\/$/, "") + "/ai/status", { headers: { Accept: "application/json" } }).then(async (response) => { const result = await response.json().catch(() => ({})); if (!response.ok || result?.ok !== true) throw new Error("Unavailable"); setAiServiceModel(String(result.model || "")); setAiServiceStatus(result.configured === true ? "ready" : "offline"); }).catch(() => setAiServiceStatus("offline")); }} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 hover:border-orange-300">Check again</button>
    </div>

    <ApprovalInbox businessId={businessId} demo={demo} />

    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-orange-500 text-white"><IconSparkle className="h-5 w-5" /></span><div className="min-w-0"><h2 className="font-semibold text-neutral-950">TWIGA AI command centre</h2><p className="text-xs text-neutral-500">{demo ? "Live Cloudflare AI · Sample workspace · English and Kiswahili" : "Cloudflare AI · Business-scoped data · English and Kiswahili"}</p></div></div><span className="shrink-0 rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{loadingProfile ? "Loading…" : thinking ? "Working…" : ready ? "Ready to save" : "Ready"}</span></div>
        <div ref={scrollRef} className="max-h-[62vh] min-h-[380px] space-y-4 overflow-y-auto bg-neutral-50/50 p-5 sm:p-6">
          {messages.map((m) => <div key={m.id} className={m.role === "user" ? "ml-auto max-w-[90%] rounded-2xl rounded-br-md border border-orange-200 bg-orange-50 px-4 py-3 text-sm leading-6 text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100" : "mr-auto max-w-[94%] rounded-2xl rounded-bl-md border border-neutral-200 bg-white px-4 py-3 text-sm leading-6 text-neutral-800 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"}>
            <div className={"mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider " + (m.role === "user" ? "text-orange-800 dark:text-orange-200" : "text-orange-600 dark:text-orange-400")}><span className={"grid h-5 w-5 place-items-center rounded-md " + (m.role === "user" ? "bg-orange-200 text-orange-900 dark:bg-white/15 dark:text-white" : "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300")}>{m.role === "user" ? "Y" : "T"}</span>{m.role === "user" ? "You" : "TWIGA AI"}</div>
            <p className="whitespace-pre-wrap">{m.text}</p>
          </div>)}
          {thinking && <div className="mr-auto flex items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-500 shadow-sm"><span className="h-2 w-2 animate-pulse rounded-full bg-orange-500" /> TWIGA is thinking through your request…</div>}
        </div>
        <div className="border-t border-neutral-100 bg-white p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-neutral-900">{demo ? "Try the live TWIGA AI assistant" : "Tell TWIGA what to configure or update"}</p><p className="mt-0.5 text-xs text-neutral-500">Set up your customer-facing AI, business workflows and provider APIs such as PalPluss. Add credentials only in secure Connections or Payments forms. Attach up to 8 business files. In this demo, files are read for this conversation only.</p></div><button type="button" onClick={() => setInput(fullSetupBrief)} disabled={thinking || building} className="inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-800 shadow-sm transition hover:border-orange-300 hover:bg-orange-100 disabled:opacity-40"><IconSparkle className="h-4 w-4" /> Insert complete setup prompt</button></div>
          {messages.length <= 1 && <div className="mb-3 flex flex-wrap gap-2">
            {["Set up my business and AI receptionist","Plan a 30-day customer subscription","Compare phone-number and business-service options","Create a payment collection workflow"].map((suggestion) => <button key={suggestion} type="button" onClick={() => void send(suggestion)} disabled={thinking || building} className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-left text-xs font-medium text-neutral-700 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800 disabled:opacity-40">{suggestion}</button>)}
          </div>}
          <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,text/csv,.txt,.csv,.md,.json,.pdf,.docx,.xlsx,.pptx" className="hidden" onChange={(e) => { const incoming = Array.from(e.target.files || []); setSelectedFiles((current) => [...current, ...incoming].slice(0, Math.max(0, 8 - pendingFileContext.length))); e.currentTarget.value = ""; }} />
          {selectedFiles.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{selectedFiles.map((file, index) => <span key={file.name + index} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs text-neutral-700"><IconFile className="h-3.5 w-3.5 shrink-0 text-orange-600" /><span className="max-w-[220px] truncate">{file.name}</span> · {formatFileSize(file.size)}<button type="button" onClick={() => setSelectedFiles((current) => current.filter((_, i) => i !== index))} className="ml-2 font-bold text-neutral-500" aria-label={"Remove " + file.name}>×</button></span>)}</div>}
          <div className="grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]"><button type="button" onClick={() => fileInputRef.current?.click()} disabled={thinking || building || (!demo && !businessId)} aria-label="Attach business files" title="Attach business files" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-700 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800 disabled:opacity-40"><IconPaperclip className="h-5 w-5" /><span>Attach files</span></button><textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="Describe your business, ask for an update, or paste the setup brief…" rows={3} className="min-h-[112px] min-w-0 w-full resize-y rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-base leading-7 text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100" /><button onClick={() => void send()} disabled={thinking || (!input.trim() && !selectedFiles.length && !pendingFileContext.length) || loadingProfile} className="inline-flex h-12 items-center justify-center gap-2 self-end rounded-xl bg-orange-500 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40 sm:self-end">{uploadingFiles ? "Uploading…" : thinking ? "Working…" : <>Send <IconSend className="h-4 w-4" /></>}</button></div>
          <p className="mt-2 text-xs leading-5 text-neutral-500">Text, CSV, Markdown, JSON and selectable PDF text are read into the AI profile draft. Original files stay in this business's private storage. Scanned PDFs and Office files are stored but need a compatible reader or OCR.</p>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-neutral-950">{areas.length} setup areas</h2><span className="text-xs text-neutral-500">{areaStatus.filter((a) => a.value).length}/{areas.length}</span></div>
          <div className="mt-4 space-y-3">
            {areaStatus.map((area) => <div key={area.key} className="flex items-start gap-2.5"><span className={"mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold " + (area.value ? "bg-orange-100 text-orange-700" : "bg-neutral-100 text-neutral-400")}>{area.value ? "✓" : "·"}</span><div className="min-w-0"><p className="text-xs font-semibold text-neutral-800">{area.label}</p><p className="mt-0.5 line-clamp-2 text-[11px] text-neutral-500">{area.value || "Not configured yet"}</p></div></div>)}
          </div>
          {missing.length > 0 && <div className="mt-4 rounded-xl bg-neutral-50 p-3"><p className="text-xs font-semibold text-neutral-700">Useful details still missing</p><ul className="mt-2 list-inside list-disc space-y-1 text-xs text-neutral-500">{missing.slice(0,8).map((x) => <li key={x}>{x}</li>)}</ul></div>}
          <button onClick={buildWorkspace} disabled={!ready || building || loadingProfile} className="mt-5 w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{building ? "Saving & configuring…" : isEditing ? "Save business & AI settings" : "Create business workspace"}</button>
          <p className="mt-2 text-[11px] leading-5 text-neutral-400">You can save a first draft when the business name, type and description are ready. Complete the remaining areas later.</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-neutral-900">Business files</h3><span className="text-[11px] text-neutral-500">{businessFiles.length} files</span></div>
          <p className="mt-2 text-xs leading-5 text-neutral-500">Private storage for this business. R2 files: {formatFileSize(storageUsedBytes)} of {formatFileSize(storageQuotaBytes)}. D1 business data: {formatFileSize(d1StorageUsedBytes)} of {formatFileSize(d1StorageQuotaBytes)} (metered data allowance). Files stay scoped to this workspace.</p>
          {!businessId ? <p className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">Create your workspace to enable secure file storage.</p> : businessFiles.length ? <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">{businessFiles.map((file) => <div key={file.file_id} className="flex items-center gap-2 rounded-lg bg-neutral-50 p-2"><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-neutral-800">{file.name}</p><p className="text-[10px] text-neutral-500">{formatFileSize(file.size_bytes)} · {file.content_type}</p></div><button type="button" onClick={() => void downloadBusinessFile(file)} className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-700">Get</button><button type="button" onClick={() => void deleteBusinessFile(file)} className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-700">Delete</button></div>)}</div> : <p className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600">No business files uploaded yet.</p>}
          {fileMessage && <p role="status" className="mt-3 text-xs text-neutral-600">{fileMessage}</p>}
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-neutral-900">AI decisions and callback approvals</h3>
        <p className="mt-2 text-xs leading-5 text-neutral-600">By default, AI may answer routine questions from verified business facts and create internal staff tasks. Calls to customers require explicit recipient consent and owner approval.</p>
        <label className="mt-3 flex items-start gap-3 rounded-xl border border-neutral-200 p-3">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-orange-500" checked={profile.setup_details?.action_approval_matrix?.allow_ai_callback_after_recipient_consent === true} onChange={(e) => setProfile((old) => ({ ...old, setup_details: { ...(old.setup_details || {}), action_approval_matrix: { ...(old.setup_details?.action_approval_matrix || {}), allow_ai_callback_after_recipient_consent: e.target.checked, routine_customer_callbacks: e.target.checked ? "auto_after_recipient_consent" : "require_owner_approval" } } }))} />
          <span><b className="block text-xs text-neutral-900">Allow routine AI callbacks after the customer explicitly agrees</b><span className="mt-1 block text-[11px] leading-5 text-neutral-500">This does not allow cold calling, bulk campaigns, marketing blasts or calls without a specific request, confirmed number and agreed time. If left off, callback requests wait for owner/admin approval in Organize.</span></span>
        </label>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><h3 className="text-sm font-semibold text-neutral-900">What TWIGA can configure</h3><p className="mt-2 text-xs leading-5 text-neutral-500">Business identity, catalogue, hours, bookings, orders, customer activity, staff workflows and verified connected services. The Cloudflare Worker scopes each request to the selected business.</p><div className="mt-3 rounded-xl border border-orange-100 bg-orange-50 p-3 text-xs leading-5 text-orange-950"><b>Approval gate:</b> paid actions must appear in Waiting for your approval with the exact provider, recipient, price, billing interval and expiry. No provider connection means no execution.</div></div>
      </aside>
    </div>
    {notice && <p role="status" className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900">{notice}</p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error.replace(/SautiKit/gi, "phone service")}</p>}
  </div>;
}
