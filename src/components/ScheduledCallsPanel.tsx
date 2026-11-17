import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";
function localDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function normalizePhone(value: string) {
  const raw = value.trim().replace(/[()\s-]/g, "");
  if (/^0[17]\d{8}$/.test(raw)) return "+254" + raw.slice(1);
  if (/^254[17]\d{8}$/.test(raw)) return "+" + raw;
  if (/^\+[1-9]\d{7,14}$/.test(raw)) return raw;
  return "";
}
function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"' && quoted && input[i + 1] === '"') { cell += '"'; i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && char === ",") { row.push(cell.trim()); cell = ""; continue; }
    if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(cell.trim()); cell = "";
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some((value) => value.length)) rows.push(row);
  return rows;
}
type UploadedContact = { name: string; phone: string; email: string };
function parseContactCsv(input: string): UploadedContact[] {
  const rows = parseCsvRows(input);
  if (!rows.length) return [];
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const first = rows[0].map(normalise);
  const hasHeader = first.some((value) => /^(name|fullname|customername|phone|phonenumber|mobile|mobilenumber|email|emailaddress)$/.test(value));
  const headers = hasHeader ? first : [];
  const nameIndex = hasHeader ? headers.findIndex((value) => /^(name|fullname|customername)$/.test(value)) : (rows[0].length > 1 ? 0 : -1);
  const phoneIndex = hasHeader ? headers.findIndex((value) => /^(phone|phonenumber|mobile|mobilenumber|tel|telephone)$/.test(value)) : (rows[0].length > 1 ? 1 : 0);
  const emailIndex = hasHeader ? headers.findIndex((value) => /^(email|emailaddress)$/.test(value)) : -1;
  if (phoneIndex < 0) throw new Error("CSV needs a phone, mobile or number column.");
  return rows.slice(hasHeader ? 1 : 0).map((row) => ({
    name: nameIndex >= 0 ? String(row[nameIndex] || "").trim() : "",
    phone: normalizePhone(String(row[phoneIndex] || "")),
    email: emailIndex >= 0 ? String(row[emailIndex] || "").trim() : "",
  })).filter((contact) => !!contact.phone);
}
export default function ScheduledCallsPanel({ businessId, defaultPhone, defaultReason, enabled }: {
  businessId: string; defaultPhone?: string; defaultReason?: string; enabled: boolean;
}) {
  const [contactsText, setContactsText] = useState(defaultPhone || "");
  const [uploadedContacts, setUploadedContacts] = useState<UploadedContact[]>([]);
  const [reason, setReason] = useState(defaultReason || "Customer follow-up");
  const [scheduledAt, setScheduledAt] = useState(() => localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [delayMinutes, setDelayMinutes] = useState("0");
  const [repeat, setRepeat] = useState("none");
  const [repeatCount, setRepeatCount] = useState("4");
  const [triggerType, setTriggerType] = useState("timer");
  const [onlyIfMissed, setOnlyIfMissed] = useState(false);
  const [retryOnNoAnswer, setRetryOnNoAnswer] = useState(true);
  const [sourceCallId, setSourceCallId] = useState("");
  const [onlyIfUnpaid, setOnlyIfUnpaid] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [authorised, setAuthorised] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [calls, setCalls] = useState<any[]>([]);
  const [missedCalls, setMissedCalls] = useState<any[]>([]);
  const [unpaidOrders, setUnpaidOrders] = useState<any[]>([]);
  useEffect(() => { if (defaultPhone) setContactsText(defaultPhone); }, [defaultPhone]);
  const loadCalls = useCallback(async () => {
    if (!supabase || !businessId) return;
    const { data, error } = await supabase.functions.invoke("twiga-scheduled-calls", { body: { action: "list", businessId } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    setCalls(Array.isArray(data.calls) ? data.calls : []);
    const [missedResult, ordersResult] = await Promise.all([
      supabase.from("twiga_call_records").select("id,created_at,from_number,to_number,status").eq("business_id", businessId).eq("direction", "inbound").in("status", ["missed", "no_answer", "failed"]).order("created_at", { ascending: false }).limit(20),
      supabase.from("twiga_orders").select("id,order_number,customer_name,customer_phone,total_amount,payment_status,created_at").eq("business_id", businessId).eq("payment_status", "unpaid").order("created_at", { ascending: false }).limit(30),
    ]);
    setMissedCalls(missedResult.error ? [] : (missedResult.data || []));
    setUnpaidOrders(ordersResult.error ? [] : (ordersResult.data || []));
  }, [businessId]);
  useEffect(() => {
    void loadCalls().catch((error) => setNotice(error instanceof Error ? error.message : "Scheduled calls could not be loaded."));
  }, [loadCalls]);
  const rawNumbers = useMemo(() => contactsText.split(/[\n,;]/).map((item) => item.trim()).filter(Boolean), [contactsText]);
  const normalized = useMemo(() => rawNumbers.map(normalizePhone), [rawNumbers]);
  const validNumbers = useMemo(() => Array.from(new Set(normalized.filter(Boolean))), [normalized]);
  const invalidCount = normalized.filter((item) => !item).length;
  async function schedule(event: FormEvent) {
    event.preventDefault();
    if (!enabled) return setNotice("Connect SautiKit and verify the existing business line before scheduling calls.");
    if (!authorised) return setNotice("Confirm that every listed recipient has authorised these calls.");
    if (!validNumbers.length) return setNotice("Enter at least one valid phone number.");
    if (invalidCount) return setNotice("Correct the " + invalidCount + " invalid phone number(s) before scheduling.");
    if (validNumbers.length > 100) return setNotice("Schedule up to 100 recipients at a time.");
    if (!reason.trim()) return setNotice("Enter the reason for calling.");
    if ((triggerType === "missed_call" || onlyIfMissed) && !sourceCallId.trim()) return setNotice("Enter the source missed-call record ID for this condition.");
    if (onlyIfUnpaid && !orderId.trim()) return setNotice("Enter the order ID for the unpaid-order condition.");
    const repeats = Math.max(1, Math.min(30, Number(repeatCount) || 1));
    const when = delayMinutes === "0" ? new Date(scheduledAt) : new Date(Date.now() + Number(delayMinutes) * 60000);
    if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() + 30000) return setNotice("Choose a future call time at least 30 seconds from now.");
    setBusy(true); setNotice("");
    try {
      const contacts = validNumbers.map((phone) => {
        const uploaded = uploadedContacts.find((item) => item.phone === phone);
        return { phone, ...(uploaded?.name ? { name: uploaded.name } : {}) };
      });
      const { data, error } = await supabase!.functions.invoke("twiga-scheduled-calls", {
        body: { action: "schedule", businessId, contacts,
          reason: reason.trim(), scheduledAt: when.toISOString(), repeat, repeatCount: repeat === "none" ? 1 : repeats, timezone: "Africa/Nairobi", authorised: true,
          triggerType, onlyIfMissed, sourceCallId: sourceCallId.trim(), onlyIfUnpaid, orderId: orderId.trim(), retryOnNoAnswer, callingWindowStart: "08:00", callingWindowEnd: "20:00" },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      let savedContactsNote = "";
      if (uploadedContacts.length && supabase) {
        const { data: authData } = await supabase.auth.getUser();
        const ownerId = authData.user?.id;
        if (ownerId) {
          const imported = uploadedContacts.filter((item) => validNumbers.includes(item.phone));
          const phones = imported.map((item) => item.phone);
          const { data: existing, error: lookupError } = await supabase.from("twiga_customers")
            .select("phone").eq("business_id", businessId).in("phone", phones);
          if (!lookupError) {
            const known = new Set((existing || []).map((item: any) => String(item.phone || "")));
            const rows = imported.filter((item) => !known.has(item.phone)).map((item) => ({
              business_id: businessId, created_by: ownerId, name: item.name || item.phone,
              phone: item.phone, email: item.email || null,
            }));
            if (rows.length) {
              const { error: insertError } = await supabase.from("twiga_customers").insert(rows);
              savedContactsNote = insertError ? " The calls were scheduled, but the uploaded contacts could not be added to the People list." : " New contacts were also added to this business's People list.";
            } else {
              savedContactsNote = " All uploaded contacts already exist in this business's People list.";
            }
          } else {
            savedContactsNote = " The calls were scheduled, but the contact list could not be checked for duplicates.";
          }
        }
      }
      setNotice((data.message || (String(data.scheduledCount || validNumbers.length) + " call(s) scheduled.")) + savedContactsNote);
      setAuthorised(false); setSourceCallId(""); setOrderId(""); setOnlyIfMissed(false); setOnlyIfUnpaid(false);
      await loadCalls();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The calls could not be scheduled.");
    } finally { setBusy(false); }
  }
  async function cancel(seriesId: string) {
    if (!window.confirm("Cancel all future calls in this scheduled series?")) return;
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase!.functions.invoke("twiga-scheduled-calls", { body: { action: "cancel", businessId, seriesId } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setNotice(data.message || "Scheduled calls cancelled.");
      await loadCalls();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The scheduled calls could not be cancelled.");
    } finally { setBusy(false); }
  }
  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-neutral-950">Scheduled calls & outreach</h2>
          <p className="mt-1 text-sm text-neutral-500">Schedule one customer or a list of authorised recipients using the same published AI receptionist and voice.</p></div>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">Timer enabled</span>
      </div>
      {!enabled && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Scheduling unlocks after the SautiKit key is connected and the existing business number is verified against the published agent.</p>}
      <form onSubmit={schedule} className="mt-4 space-y-3">
        <label className="block text-sm font-medium text-neutral-700">Recipient phone numbers
          <textarea value={contactsText} onChange={(event) => setContactsText(event.target.value)} rows={3}
            placeholder={"+2547XXXXXXXX\n+2547XXXXXXXX"} className="mt-1.5 w-full rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-orange-500" />
          <span className="mt-1 block text-xs font-normal text-neutral-600">One number per line, or upload a CSV with Name, Phone and optional Email columns. Kenyan 07… / 01… numbers are converted to +254 automatically. Maximum 100 per batch.</span>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-neutral-300 bg-neutral-900 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800">
              Upload call list (.csv)
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                try {
                  const parsed = parseContactCsv(await file.text());
                  const unique = Array.from(new Map(parsed.map((contact) => [contact.phone, contact])).values());
                  if (!unique.length) throw new Error("No valid phone numbers were found. Use a Phone column and Kenyan 07… / 01… or international numbers.");
                  if (unique.length > 100) throw new Error("This list has " + unique.length + " valid numbers. Upload up to 100 per call batch.");
                  setUploadedContacts(unique);
                  setContactsText(unique.map((contact) => contact.phone).join("\n"));
                  setNotice(unique.length + " contacts loaded from " + file.name + ". Review the numbers and confirm call permission before scheduling.");
                } catch (error) {
                  setUploadedContacts([]);
                  setNotice(error instanceof Error ? error.message : "The CSV could not be read.");
                }
              }} />
            </label>
            {uploadedContacts.length > 0 && <span className="text-xs text-neutral-600">{uploadedContacts.length} CSV contacts loaded</span>}
            <button type="button" onClick={() => { setUploadedContacts([]); setContactsText(""); }} className="text-xs font-semibold text-neutral-600 underline">Clear list</button>
          </div>
        </label>
        <label className="block text-sm font-medium text-neutral-700">Reason for calling
          <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500}
            placeholder="Booking confirmation, lead follow-up, order update…" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-500" />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm font-medium text-neutral-700">Call time
            <input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} disabled={delayMinutes !== "0"}
              className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm disabled:bg-neutral-50" />
          </label>
          <label className="block text-sm font-medium text-neutral-700">Timer trigger
            <select value={delayMinutes} onChange={(event) => setDelayMinutes(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm">
              <option value="0">At selected time</option><option value="5">In 5 minutes</option><option value="15">In 15 minutes</option>
              <option value="30">In 30 minutes</option><option value="60">In 1 hour</option><option value="1440">In 24 hours</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-neutral-700">Repeat condition
            <select value={repeat} onChange={(event) => setRepeat(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm">
              <option value="none">One-time call</option><option value="daily">Repeat daily</option><option value="weekly">Repeat weekly</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-neutral-700">Call trigger type
            <select value={triggerType} onChange={(event) => setTriggerType(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm">
              <option value="timer">Timer · at selected time</option><option value="missed_call">Missed-call callback</option><option value="appointment_reminder">Appointment reminder</option><option value="follow_up">Customer follow-up</option><option value="conditional">Conditional outreach</option>
            </select>
          </label>
          {repeat !== "none" && <label className="block text-sm font-medium text-neutral-700">Total calls in this repeat series
            <input type="number" min={2} max={30} value={repeatCount} onChange={(event) => setRepeatCount(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm" />
          </label>}
        </div>
        <div className="grid gap-3 rounded-xl border border-neutral-200 p-3 sm:grid-cols-2">
          <div><label className="flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" checked={onlyIfMissed} onChange={(event) => setOnlyIfMissed(event.target.checked)} className="mt-1" />Only call if the source inbound call is still missed or unanswered</label><select value={sourceCallId} onChange={(event) => setSourceCallId(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm"><option value="">Select a missed inbound call…</option>{missedCalls.map(call => <option key={call.id} value={call.id}>{new Date(call.created_at).toLocaleString()} · {call.from_number || call.to_number || "Unknown number"} · {call.status}</option>)}</select>{!missedCalls.length && <p className="mt-1 text-xs text-neutral-500">No missed inbound calls are recorded for this business yet.</p>}</div>
          <div><label className="flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" checked={onlyIfUnpaid} onChange={(event) => setOnlyIfUnpaid(event.target.checked)} className="mt-1" />Only call if the related order is still unpaid</label><select value={orderId} onChange={(event) => setOrderId(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm"><option value="">Select an unpaid order…</option>{unpaidOrders.map(order => <option key={order.id} value={order.id}>#{order.order_number || order.id.slice(0, 8)} · {order.customer_name || order.customer_phone || "Customer"} · KSh {Number(order.total_amount || 0).toLocaleString()}</option>)}</select>{!unpaidOrders.length && <p className="mt-1 text-xs text-neutral-500">No unpaid orders are recorded for this business yet.</p>}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 p-3">
          <label className="flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" checked={retryOnNoAnswer} onChange={(event) => setRetryOnNoAnswer(event.target.checked)} className="mt-1" />
            <span><strong className="font-semibold text-neutral-900">Retry once when unanswered</strong><span className="mt-1 block text-xs text-neutral-500">Wait five minutes, then make one final attempt. If there is still no answer, mark the contact as Unreachable. A no-answer result does not prove the phone number is invalid.</span></span>
          </label>
        </div>
        <label className="flex items-start gap-2 text-sm text-neutral-700"><input type="checkbox" checked={authorised} onChange={(event) => setAuthorised(event.target.checked)} className="mt-1" />
          <span>I confirm every recipient has authorised these calls and can be contacted for this stated purpose.</span></label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || !enabled || !validNumbers.length || !authorised} className="rounded-xl bg-neutral-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving schedule…" : "Schedule " + validNumbers.length + " call(s)"}</button>
          <span className="text-xs text-neutral-500">Temporary provider submission errors retry up to 3 times. Calls are held to 08:00–20:00 Nairobi time.</span>
        </div>
      </form>
      <div className="mt-6 border-t border-neutral-100 pt-4">
        <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-neutral-900">Scheduled call queue</h3>
          <button type="button" onClick={() => void loadCalls()} disabled={busy} className="text-xs font-semibold text-orange-700 underline">Refresh</button></div>
        {!calls.length ? <p className="mt-3 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-500">No scheduled calls yet.</p> :
          <div className="mt-3 divide-y divide-neutral-100">{calls.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0"><p className="font-semibold text-neutral-900">{item.phone_number}</p>
                <p className="mt-1 text-xs text-neutral-500">{item.task} · {new Date(item.due_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</p>
                <p className="mt-1 text-xs text-neutral-500">{item.metadata?.repeat && item.metadata.repeat !== "none" ? "Repeats " + item.metadata.repeat : "One-time"} · {item.metadata?.dispatch_status || item.status}</p>{item.last_error && <p className="mt-1 text-xs text-neutral-600">{item.last_error}</p>}</div>
              <div className="flex items-center gap-2"><span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">{item.metadata?.final_outcome === "unreachable_after_no_answer" ? "Unreachable" : item.metadata?.final_outcome === "invalid_number" ? "Invalid number" : item.status}</span>
                {["pending", "scheduled", "waiting_for_provider"].includes(item.status) && <button type="button" onClick={() => void cancel(String(item.metadata?.series_id || item.id))} disabled={busy} className="text-xs font-semibold text-orange-700 underline">Cancel</button>}</div>
            </div>
          ))}</div>}
      </div>
      {notice && <p role="status" className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">{notice}</p>}
    </section>
  );
}
