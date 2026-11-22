import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type Contact = { name: string; phone: string; consent: boolean; optOut?: boolean; email?: string; itemsBought?: string; notes?: string; preferredLanguage?: string; lastPurchaseAt?: string; followUpAt?: string };
const DEFAULT_SCRIPT = "Hello, this is the AI assistant calling on behalf of {{business_name}}. We have a special offer: {{offer}}. Would you like me to tell you more? If you are not interested, I can end the call and make sure we do not contact you about this offer again.";
const DAY_OPTIONS = [{ id: 1, label: "Mon" }, { id: 2, label: "Tue" }, { id: 3, label: "Wed" }, { id: 4, label: "Thu" }, { id: 5, label: "Fri" }, { id: 6, label: "Sat" }, { id: 0, label: "Sun" }];
const NAIROBI_TIME_ZONE = "Africa/Nairobi";

function normalizePhone(value: string) {
  let n = String(value || "").trim().replace(/[\s().-]/g, "");
  if (/^0[17]\d{8}$/.test(n)) n = "+254" + n.slice(1);
  else if (/^254[17]\d{8}$/.test(n)) n = "+" + n;
  return /^\+254[17]\d{8}$/.test(n) ? n : "";
}
function parseCsv(text: string): Contact[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && quoted && text[i + 1] === '"') { cell += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.toLowerCase().replace(/[ _-]/g, ""));
  const index = (names: string[]) => headers.findIndex(h => names.includes(h));
  const phoneIndex = index(["phone", "phonenumber", "mobile", "number"]);
  const nameIndex = index(["name", "customer", "customername", "firstname"]);
  const consentIndex = index(["consent", "optin", "optedin", "permission", "marketingconsent"]);
  const optOutIndex = index(["optout", "unsubscribe", "unsubscribed", "donotcontact"]);
  const emailIndex = index(["email", "emailaddress"]);
  const purchasesIndex = index(["itemsbought", "purchases", "purchasehistory", "productsbought", "productinterest", "items"]);
  const notesIndex = index(["notes", "customernotes", "context"]);
  const languageIndex = index(["preferredlanguage", "language", "customerlanguage"]);
  const lastPurchaseIndex = index(["lastpurchaseat", "lastpurchase", "lastpurchasedate"]);
  const followUpIndex = index(["followupat", "followupdate"]);
  if (phoneIndex < 0 || consentIndex < 0) throw new Error("Your CSV/XLSX needs phone and consent columns. Add name, email, items_bought, notes, preferred_language and last_purchase_at where available.");
  return rows.slice(1).map(r => ({
    name: nameIndex >= 0 ? (r[nameIndex] || "Customer") : "Customer",
    phone: normalizePhone(r[phoneIndex] || ""),
    consent: ["yes", "true", "1", "opt-in", "opted-in", "consented"].includes(String(r[consentIndex] || "").toLowerCase().trim()),
    optOut: optOutIndex >= 0 && ["yes", "true", "1", "unsubscribe", "opted-out"].includes(String(r[optOutIndex] || "").toLowerCase().trim()),
    email: emailIndex >= 0 ? String(r[emailIndex] || "").trim() : "",
    itemsBought: purchasesIndex >= 0 ? String(r[purchasesIndex] || "").trim() : "",
    notes: notesIndex >= 0 ? String(r[notesIndex] || "").trim() : "",
    preferredLanguage: languageIndex >= 0 ? String(r[languageIndex] || "").trim() : "",
    lastPurchaseAt: lastPurchaseIndex >= 0 ? String(r[lastPurchaseIndex] || "").trim() : "",
    followUpAt: followUpIndex >= 0 ? String(r[followUpIndex] || "").trim() : "",
  })).filter(c => c.phone);
}
function nairobiDateParts(date: Date) {
  const values = new Intl.DateTimeFormat("en-GB", {
    timeZone: NAIROBI_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).reduce((out: Record<string,string>, part) => {
    if (part.type !== "literal") out[part.type] = part.value;
    return out;
  }, {});
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), hour: Number(values.hour), minute: Number(values.minute) };
}
function nextSlot(from: Date, days: number[], start: string, end: string): Date {
  const permitted = Array.from(new Set(days.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6)));
  if (!permitted.length) throw new Error("Select at least one calling day.");
  const [sh, sm] = start.split(":").map(Number), [eh, em] = end.split(":").map(Number);
  if (![sh,sm,eh,em].every(Number.isFinite) || sh < 0 || sh > 23 || eh < 0 || eh > 23 || sm < 0 || sm > 59 || em < 0 || em > 59 || start >= end) {
    throw new Error("Choose a valid Kenya-time calling window.");
  }
  const base = nairobiDateParts(from);
  for (let offset = 0; offset < 35; offset++) {
    // Build the calendar date using UTC arithmetic, then interpret the selected
    // wall-clock time explicitly in Nairobi (UTC+03:00), independent of browser zone.
    const day = new Date(Date.UTC(base.year, base.month - 1, base.day + offset));
    if (!permitted.includes(day.getUTCDay())) continue;
    const dateKey = day.toISOString().slice(0,10);
    const begin = new Date(dateKey + "T" + start + ":00+03:00");
    const finish = new Date(dateKey + "T" + end + ":00+03:00");
    const candidate = offset === 0 && from > begin ? from : begin;
    if (candidate < finish) return candidate;
  }
  throw new Error("Could not find a calling slot. Select at least one day and a valid calling window.");
}
export default function Outreach({ businessId, demo = false }: { businessId: string; demo?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [offer, setOffer] = useState("");
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [greeting, setGreeting] = useState("Hello, karibu! How can I help you today?");
  const [inboundPrompt, setInboundPrompt] = useState("Answer questions about the business accurately, help with bookings and orders, and ask before saving customer details.");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [fileName, setFileName] = useState("");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [testNumber, setTestNumber] = useState("");
  const [testConsent, setTestConsent] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [testText, setTestText] = useState("A customer asks: What is the offer, how much does it cost, and how can I book?");
  const [testReply, setTestReply] = useState("");
  const [phoneLine, setPhoneLine] = useState<any>(null);
  const [providerConnected, setProviderConnected] = useState(false);
  const [numberVerified, setNumberVerified] = useState(false);
  const [providerNumber, setProviderNumber] = useState("");
  const [providerError, setProviderError] = useState("");
  const [configLoading, setConfigLoading] = useState(true);
  const refreshPhoneConfig = async () => {
    if (!supabase || !businessId || demo) return;
    const { data, error: invokeError } = await supabase.functions.invoke("twiga-sautikit", { body: { action: "get_config", businessId } });
    if (invokeError) throw new Error(invokeError.message);
    if (data?.error) throw new Error(String(data.error));
    setPhoneLine(data?.phoneLine || null);
    setProviderConnected(data?.providerConnected === true);
    setNumberVerified(data?.numberVerified === true);
    setProviderNumber(String(data?.providerNumber || ""));
    setProviderError(String(data?.providerError || ""));
    if (data?.scripts?.greeting) setGreeting(String(data.scripts.greeting));
    if (data?.scripts?.inbound) setInboundPrompt(String(data.scripts.inbound));
    if (data?.scripts?.outbound) setScript(String(data.scripts.outbound));
  };
  useEffect(() => {
    if (!supabase || !businessId || demo) { setConfigLoading(false); return; }
    let active = true;
    void supabase.functions.invoke("twiga-sautikit", { body: { action: "get_config", businessId } }).then(({ data, error: invokeError }) => {
      if (!active) return;
      if (invokeError) { setProviderError(invokeError.message); return; }
      if (!data) return;
      setPhoneLine(data.phoneLine || null);
      setProviderConnected(data.providerConnected === true);
      setNumberVerified(data.numberVerified === true);
      setProviderNumber(String(data.providerNumber || ""));
      setProviderError(String(data.providerError || ""));
      if (data.scripts?.greeting) setGreeting(String(data.scripts.greeting));
      if (data.scripts?.inbound) setInboundPrompt(String(data.scripts.inbound));
      if (data.scripts?.outbound) setScript(String(data.scripts.outbound));
    }).finally(() => { if (active) setConfigLoading(false); });
    return () => { active = false; };
  }, [businessId, demo]);
  const optedIn = contacts.filter(c => c.consent && !c.optOut);
  const invalidCount = useMemo(() => contacts.length - optedIn.length, [contacts, optedIn.length]);
  const publishedPrompt = useMemo(() => script.replaceAll("{{offer}}", offer || "our current offer"), [script, offer]);

  const importFile = async (file?: File) => {
    if (!file) return;
    setError(""); setMessage("");
    try {
      const extension = file.name.toLowerCase().split(".").pop() || "";
      if (!["csv", "xlsx", "xls"].includes(extension)) throw new Error("Upload a CSV or Excel workbook (.csv, .xlsx or .xls).");
      let sourceText = "";
      if (extension === "csv") sourceText = await file.text();
      else {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        if (!firstSheet) throw new Error("The Excel workbook has no worksheet.");
        sourceText = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheet]);
      }
      const parsed = parseCsv(sourceText);
      const deduped = Array.from(new Map(parsed.map(contact => [contact.phone, contact])).values());
      if (!deduped.length) throw new Error("No valid Kenyan phone numbers were found in this file.");
      if (deduped.length > 500) throw new Error("Upload up to 500 contacts per file. Split larger lists into separate files.");
      if (!supabase || !businessId) throw new Error("Select a signed-in business workspace first.");
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) throw new Error("Your sign-in has expired. Sign in again.");
      const response = await fetch("https://twiga-business-files.twiga-ke.workers.dev/v1/contacts/" + encodeURIComponent(businessId), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + sessionData.session.access_token },
        body: JSON.stringify({
          source: "csv",
          contacts: deduped.map(contact => ({
            name: contact.name, phone: contact.phone, email: contact.email || "",
            purchases: contact.itemsBought || "", notes: contact.notes || "",
            preferredLanguage: contact.preferredLanguage || "", lastPurchaseAt: contact.lastPurchaseAt || "",
            followUpAt: contact.followUpAt || "", marketingConsent: contact.consent, optOut: contact.optOut === true,
          })),
        }),
      });
      const saved = await response.json().catch(() => ({}));
      if (!response.ok || saved?.ok !== true) throw new Error(String(saved?.error || "Customer profiles could not be saved to this business workspace."));
      setContacts(deduped); setFileName(file.name);
      setMessage("Imported and saved " + Number(saved.saved || deduped.length) + " customer profiles to this business. " + deduped.filter(c => c.consent && !c.optOut).length + " have recorded promotional-call consent; opted-out contacts are excluded.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read this CSV."); }
  };
  const publish = async () => {
    if (!offer.trim() || !script.trim()) { setError("Add your offer and the words your AI should say."); return; }
    if (!supabase || !businessId) { setError("Select a business workspace first."); return; }
    setPublishing(true); setError(""); setMessage("Publishing your outbound offer to the AI receptionist…");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("twiga-sautikit", { body: { action: "publish_agent", businessId, greeting, inboundPrompt, outboundPrompt: publishedPrompt } });
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(String(data.error));
      await refreshPhoneConfig();
      setMessage(data?.message || "Offer and outbound instructions published. Check the outbound status below before scheduling calls.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not publish the offer."); }
    finally { setPublishing(false); }
  };
  const testCall = async () => {
    const to = normalizePhone(testNumber);
    if (!to) { setError("Enter a valid Kenyan mobile number."); return; }
    if (!testConsent) { setError("Confirm you own this number or have permission to receive the test call."); return; }
    if (!providerConnected || !numberVerified || !providerNumber) {
      setError("A real, verified SautiKit caller number is not connected to this workspace yet. Connect/claim a dialable number in SautiKit and have TWIGA verify it before placing a test call.");
      return;
    }
    if (!supabase || !businessId) { setError("Select a business workspace first."); return; }
    if (!window.confirm("Place a real AI test call to " + to + "? Provider call charges may apply.")) return;
    setTesting(true); setError(""); setMessage("Sending your AI test call request…");
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("twiga-sautikit", { body: { action: "send_call", businessId, to, reason: "Owner-requested TWIGA promotional AI test call", testMode: true, authorised: true, consent: true } });
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(String(data.error));
      setMessage(data?.message || "Test call request submitted to " + to + ".");
    } catch (e) { setError(e instanceof Error ? e.message : "Test call could not be submitted."); }
    finally { setTesting(false); }
  };
  const launch = async () => {
    if (!offer.trim()) { setError("Publish an offer before starting the campaign."); return; }
    if (!optedIn.length) { setError("Your CSV needs a consent/opt-in column, and at least one contact must have agreed to promotional calls."); return; }
    if (!days.length) { setError("Choose at least one calling day."); return; }
    if (!providerConnected || !numberVerified || !providerNumber || phoneLine?.outbound_enabled !== true || phoneLine?.outbound_status !== "active") {
      setError("Campaigns cannot be dispatched yet. This business's SautiKit outbound line is not verified and active. TWIGA must verify and enable outbound calling before calls can be placed. No campaign was queued.");
      return;
    }
    if (start >= end) { setError("End time must be later than start time."); return; }
    if (optedIn.length > 200) { setError("For safety, upload no more than 200 opted-in contacts per campaign batch."); return; }
    if (!supabase || !businessId) { setError("Select a business workspace first."); return; }
    if (!window.confirm("Queue " + optedIn.length + " consented contacts for promotional calls during " + start + "–" + end + " on your selected days? Calls will be scheduled, not placed all at once.")) return;
    setLaunching(true); setError(""); setMessage("Scheduling opted-in contacts…");
    try {
      const scheduledContacts: { name: string; phone: string; scheduledAt: string; email?: string; itemsBought?: string; notes?: string; preferredLanguage?: string; lastPurchaseAt?: string }[] = [];
      let cursor = new Date(Date.now() + 5 * 60_000);
      for (const contact of optedIn) {
        const slot = nextSlot(cursor, days, start, end);
        scheduledContacts.push({ name: contact.name, phone: contact.phone, scheduledAt: slot.toISOString(), email: contact.email, itemsBought: contact.itemsBought, notes: contact.notes, preferredLanguage: contact.preferredLanguage, lastPurchaseAt: contact.lastPurchaseAt });
        cursor = new Date(slot.getTime() + 5 * 60_000);
      }
      const { data, error: scheduleError } = await supabase.functions.invoke("twiga-scheduled-calls", {
        body: {
          action: "schedule",
          businessId,
          authorised: true,
          contacts: scheduledContacts,
          reason: ("Promotional offer: " + offer.trim() + "\nAI instructions: " + publishedPrompt).slice(0, 500),
          timezone: NAIROBI_TIME_ZONE,
          callingWindowStart: start,
          callingWindowEnd: end,
          allowedDays: days,
          triggerType: "timer",
          retryOnNoAnswer: true,
          retryDelayMinutes: 30,
        },
      });
      if (scheduleError) throw new Error(scheduleError.message);
      if (data?.error) throw new Error(String(data.error));
      setMessage(data?.message || ("Campaign queued: " + Number(data?.scheduledCount || scheduledContacts.length) + " consented contacts scheduled across " + DAY_OPTIONS.filter(day => days.includes(day.id)).map(day => day.label).join(", ") + ". Dispatch will begin only while the SautiKit outbound line is active."));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not queue the campaign."); }
    finally { setLaunching(false); }
  };
  const runTextTest = () => {
    const q = testText.toLowerCase();
    if (q.includes("price") || q.includes("cost")) setTestReply("The AI should explain the offer price clearly, confirm what is included, and avoid inventing discounts. Add the exact price and conditions to your offer before publishing.");
    else if (q.includes("stop") || q.includes("not interested")) setTestReply("The AI should politely thank the person, end the call, and respect the request not to receive further promotional calls.");
    else if (q.includes("book") || q.includes("appointment")) setTestReply("The AI should ask what day and time works, collect the customer's details, and confirm availability before promising a booking.");
    else setTestReply("Suggested AI opening: " + publishedPrompt);
  };

  if (demo) return <section className="rounded-2xl border border-neutral-200 bg-white p-6"><h1 className="text-2xl font-bold">Outreach</h1><p className="mt-2 text-sm text-neutral-600">Create promotional calling campaigns, upload a CSV and test your AI receptionist. Sign in to use live calling.</p></section>;
  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="rounded-2xl border border-neutral-200 bg-white p-6"><p className="text-xs font-bold uppercase tracking-widest text-orange-600">TWIGA · Campaigns</p><h1 className="mt-2 text-3xl font-bold text-neutral-950">Outreach</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">Create a promotional offer, upload opted-in contacts, choose when the AI may call, and test the experience before launch.</p></header>
    {(message || error) && <div className={"rounded-xl border px-4 py-3 text-sm " + (error ? "border-red-200 bg-red-50 text-red-800" : "border-orange-200 bg-orange-50 text-orange-900")}>{error || message}</div>}
    <section className={"rounded-2xl border p-4 " + (phoneLine?.outbound_enabled === true && phoneLine?.outbound_status === "active" ? "border-orange-200 bg-orange-50" : "border-amber-200 bg-amber-50")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-orange-700">Outbound readiness</p>
          <p className="mt-1 text-sm font-semibold text-neutral-950">{configLoading ? "Checking the phone service…" : !providerConnected || !numberVerified || !providerNumber ? "No verified SautiKit caller number" : phoneLine?.outbound_enabled === true && phoneLine?.outbound_status === "active" ? "Outbound calling is active" : "Caller number found · outbound is not enabled"}</p>
          <p className="mt-1 text-xs leading-5 text-neutral-700">{configLoading ? "Reading the live SautiKit line status." : !providerConnected || !numberVerified || !providerNumber ? "No verified, dialable SautiKit number is connected to this workspace." : phoneLine ? "Verified caller: " + providerNumber + " · Line status: " + String(phoneLine.outbound_status || "not configured") + " · " + (phoneLine.outbound_enabled === true ? "Enabled" : "Disabled") : "No SautiKit phone line is assigned to this business."}</p>
          {providerError && <p className="mt-1 text-xs leading-5 text-neutral-600">{providerError}</p>}
          {!providerConnected || !numberVerified || !providerNumber || phoneLine?.outbound_enabled !== true || phoneLine?.outbound_status !== "active" ? <p className="mt-2 text-xs font-medium leading-5 text-amber-950">The connected SautiKit workspace must contain a dialable number, and TWIGA must verify that number and enable outbound. The campaign will stay blocked until all three checks pass.</p> : <p className="mt-2 text-xs text-neutral-700">Campaign calls will respect the selected Nairobi days and time window.</p>}
        </div>
        <button type="button" onClick={() => { setConfigLoading(true); void refreshPhoneConfig().catch(e => setProviderError(e instanceof Error ? e.message : "Could not refresh phone status.")).finally(() => setConfigLoading(false)); }} disabled={configLoading} className="shrink-0 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 disabled:opacity-50">Refresh phone status</button>
      </div>
    </section>
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <div><p className="text-xs font-bold uppercase tracking-wide text-orange-600">01 · Your offer</p><h2 className="mt-1 text-xl font-bold text-neutral-950">What should the agent promote?</h2><p className="mt-1 text-sm text-neutral-600">Be clear about the product, price, dates and conditions. The AI must not invent details.</p></div>
        <label className="block text-sm font-semibold text-neutral-800">Offer details<textarea value={offer} onChange={e => setOffer(e.target.value)} rows={4} placeholder="e.g. This week: 20% off all haircuts. Book before Friday. Terms apply." className="mt-2 w-full rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-900 outline-none focus:border-orange-400" /></label>
        <label className="block text-sm font-semibold text-neutral-800">What the AI should say<textarea value={script} onChange={e => setScript(e.target.value)} rows={5} className="mt-2 w-full rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-900 outline-none focus:border-orange-400" /></label>
        <p className="text-xs text-neutral-500">Use {"{{business_name}}"} for your business name and {"{{offer}}"} for the offer details.</p>
        <button onClick={() => void publish()} disabled={publishing} className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{publishing ? "Publishing…" : "Publish offer to AI"}</button>
      </div>
      <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
        <div><p className="text-xs font-bold uppercase tracking-wide text-orange-600">02 · Contact list</p><h2 className="mt-1 text-xl font-bold text-neutral-950">Upload your CSV or Excel list</h2><p className="mt-1 text-sm text-neutral-600">Required columns: phone and consent. Optional: name, email, items_bought, notes, preferred_language and last_purchase_at. Each contact is saved to this business's private customer directory.</p></div>
        <button onClick={() => fileRef.current?.click()} className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center hover:border-orange-400"><span className="text-2xl">↑</span><span className="mt-2 text-sm font-bold text-neutral-800">Choose CSV or Excel file</span><span className="mt-1 text-xs text-neutral-500">{fileName || "Upload .csv, .xlsx or .xls · up to 500 saved profiles"}</span></button>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" className="hidden" onChange={e => void importFile(e.target.files?.[0])} />
        <div className="grid grid-cols-3 gap-2"><div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Valid numbers</p><p className="text-xl font-bold text-neutral-900">{contacts.length}</p></div><div className="rounded-xl bg-orange-50 p-3"><p className="text-xs text-orange-700">Opted in</p><p className="text-xl font-bold text-neutral-900">{optedIn.length}</p></div><div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Not eligible</p><p className="text-xl font-bold text-neutral-900">{invalidCount}</p></div></div>
        <p className="text-xs text-neutral-500">Example CSV: <code>name,phone,consent</code> then <code>Jane,0712345678,yes</code>. Keep proof of consent and honour opt-outs.</p>
        {contacts.length > 0 && <div className="max-h-36 overflow-y-auto rounded-xl border border-neutral-200"><div className="grid grid-cols-3 bg-neutral-50 px-3 py-2 text-xs font-bold text-neutral-600"><span>Name</span><span>Phone</span><span>Permission</span></div>{contacts.slice(0, 8).map((c, i) => <div key={i} className="grid grid-cols-3 border-t border-neutral-100 px-3 py-2 text-xs"><span className="truncate">{c.name}</span><span>{c.phone}</span><span className={c.consent ? "text-orange-700" : "text-neutral-500"}>{c.consent ? "Opted in" : "Not eligible"}</span></div>)}</div>}
      </div>
    </section>
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-orange-600">03 · Calling schedule</p><h2 className="mt-1 text-xl font-bold text-neutral-950">Choose days and calling hours</h2>
      <p className="mt-2 text-xs text-neutral-500">All seven days are selected by default, including Saturday and Sunday. Toggle any day off to exclude it.</p>
      <div className="mt-3 flex flex-wrap gap-2">{DAY_OPTIONS.map(d => <button type="button" key={d.id} aria-pressed={days.includes(d.id)} onClick={() => setDays(old => old.includes(d.id) ? old.filter(x => x !== d.id) : [...old, d.id])} className={"rounded-xl border px-4 py-2 text-sm font-semibold transition-colors " + (days.includes(d.id) ? "border-orange-400 bg-orange-500 text-white" : "border-neutral-200 bg-white text-neutral-600 hover:border-orange-300")}>{d.label}</button>)}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold text-neutral-700">Start time (Kenya time)<input type="time" value={start} onChange={e => setStart(e.target.value)} className="mt-1 block w-full rounded-xl border border-neutral-200 p-3" /></label><label className="text-sm font-semibold text-neutral-700">End time (Kenya time)<input type="time" value={end} onChange={e => setEnd(e.target.value)} className="mt-1 block w-full rounded-xl border border-neutral-200 p-3" /></label></div>
      <p className="mt-3 text-xs text-neutral-500">Calls are queued at least five minutes apart and only for contacts marked opted-in. Check local rules and your customers' preferences before launching.</p>
      <button onClick={() => void launch()} disabled={launching || !optedIn.length || configLoading || !providerConnected || !numberVerified || !providerNumber || phoneLine?.outbound_enabled !== true || phoneLine?.outbound_status !== "active"} className="mt-4 w-full rounded-xl bg-neutral-950 px-4 py-3 text-sm font-bold text-white hover:bg-neutral-800 disabled:opacity-40">{launching ? "Scheduling campaign…" : "Start outreach campaign · " + optedIn.length + " opted-in contacts"}</button>
    </section>
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wide text-orange-600">04 · Real test call</p><h2 className="mt-1 text-xl font-bold text-neutral-950">Call yourself first</h2><p className="mt-1 text-sm text-neutral-600">Enter your own number only when you are ready to place a real test call. Provider charges may apply.</p><label className="mt-4 block text-sm font-semibold text-neutral-700">Your mobile number<input value={testNumber} onChange={e => setTestNumber(e.target.value)} placeholder="+2547XXXXXXXX" autoComplete="tel" className="mt-1 w-full rounded-xl border border-neutral-200 p-3" /></label><label className="mt-3 flex items-start gap-2 text-xs text-neutral-600"><input type="checkbox" checked={testConsent} onChange={e => setTestConsent(e.target.checked)} className="mt-0.5" />I own this number or have permission to receive this test call.</label><button onClick={() => void testCall()} disabled={testing || configLoading || !providerConnected || !numberVerified || !providerNumber || !testNumber.trim() || !testConsent} className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{testing ? "Calling…" : "Place test call"}</button></div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-5"><p className="text-xs font-bold uppercase tracking-wide text-orange-600">05 · AI test space</p><h2 className="mt-1 text-xl font-bold text-neutral-950">Try a customer question</h2><p className="mt-1 text-sm text-neutral-600">Preview your script and think through common questions before the live call.</p><textarea value={testText} onChange={e => setTestText(e.target.value)} rows={3} className="mt-4 w-full rounded-xl border border-neutral-200 p-3 text-sm" /><button onClick={runTextTest} className="mt-2 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-bold text-neutral-800 hover:bg-neutral-50">Preview response</button>{testReply && <div className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm leading-6 text-neutral-800">{testReply}</div>}<p className="mt-3 text-xs text-neutral-500">This text preview is a rehearsal aid, not a live model response. Use the real test call above to hear the configured voice.</p></div>
    </section>
  </div>;
}
