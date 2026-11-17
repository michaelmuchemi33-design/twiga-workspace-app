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
export default function ScheduledCallsPanel({ businessId, defaultPhone, defaultReason, enabled }: {
  businessId: string; defaultPhone?: string; defaultReason?: string; enabled: boolean;
}) {
  const [contactsText, setContactsText] = useState(defaultPhone || "");
  const [reason, setReason] = useState(defaultReason || "Customer follow-up");
  const [scheduledAt, setScheduledAt] = useState(() => localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [delayMinutes, setDelayMinutes] = useState("0");
  const [repeat, setRepeat] = useState("none");
  const [authorised, setAuthorised] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [calls, setCalls] = useState<any[]>([]);
  useEffect(() => { if (defaultPhone) setContactsText(defaultPhone); }, [defaultPhone]);
  const loadCalls = useCallback(async () => {
    if (!supabase || !businessId) return;
    const { data, error } = await supabase.functions.invoke("twiga-scheduled-calls", { body: { action: "list", businessId } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    setCalls(Array.isArray(data.calls) ? data.calls : []);
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
    const when = delayMinutes === "0" ? new Date(scheduledAt) : new Date(Date.now() + Number(delayMinutes) * 60000);
    if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() + 30000) return setNotice("Choose a future call time at least 30 seconds from now.");
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase!.functions.invoke("twiga-scheduled-calls", {
        body: { action: "schedule", businessId, contacts: validNumbers.map((phone) => ({ phone })),
          reason: reason.trim(), scheduledAt: when.toISOString(), repeat, timezone: "Africa/Nairobi", authorised: true },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setNotice(data.message || (String(data.scheduledCount || validNumbers.length) + " call(s) scheduled."));
      setAuthorised(false);
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
          <span className="mt-1 block text-xs font-normal text-neutral-500">One number per line. Kenyan 07… / 01… numbers are converted to +254 automatically. Maximum 100 per batch.</span>
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
                <p className="mt-1 text-xs text-neutral-500">{item.metadata?.repeat && item.metadata.repeat !== "none" ? "Repeats " + item.metadata.repeat : "One-time"} · {item.metadata?.dispatch_status || item.status}</p></div>
              <div className="flex items-center gap-2"><span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">{item.status}</span>
                {item.status === "pending" && <button type="button" onClick={() => void cancel(String(item.metadata?.series_id || item.id))} disabled={busy} className="text-xs font-semibold text-orange-700 underline">Cancel</button>}</div>
            </div>
          ))}</div>}
      </div>
      {notice && <p role="status" className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">{notice}</p>}
    </section>
  );
}
