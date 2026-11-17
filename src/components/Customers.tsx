import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStore, type Customer } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconUsers, IconPhone, IconSend, IconClock, IconSparkle, IconAlert, IconTrend } from "@/components/Icons";

type Contact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
};
type FollowUp = {
  id: string;
  customer_name: string | null;
  phone_number: string;
  task: string;
  channel: string;
  due_at: string;
  status: string;
  consent_status: string;
};
type ContactDraft = { name: string; phone: string; email: string; notes: string };

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
function parseContactsCsv(input: string): ContactDraft[] {
  const rows = parseCsvRows(input);
  if (!rows.length) return [];
  const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  const first = rows[0].map(normalise);
  const hasHeader = first.some((value) => /^(name|fullname|customername|phone|phonenumber|mobile|mobilenumber|email|emailaddress|notes)$/.test(value));
  const headers = hasHeader ? first : [];
  const nameIndex = hasHeader ? headers.findIndex((value) => /^(name|fullname|customername)$/.test(value)) : 0;
  const phoneIndex = hasHeader ? headers.findIndex((value) => /^(phone|phonenumber|mobile|mobilenumber|tel|telephone)$/.test(value)) : (rows[0].length > 1 ? 1 : 0);
  const emailIndex = hasHeader ? headers.findIndex((value) => /^(email|emailaddress)$/.test(value)) : -1;
  const notesIndex = hasHeader ? headers.findIndex((value) => value === "notes") : -1;
  return rows.slice(hasHeader ? 1 : 0).map((row) => ({
    name: nameIndex >= 0 ? String(row[nameIndex] || "").trim() : "",
    phone: phoneIndex >= 0 ? normalizePhone(String(row[phoneIndex] || "")) : "",
    email: emailIndex >= 0 ? String(row[emailIndex] || "").trim() : "",
    notes: notesIndex >= 0 ? String(row[notesIndex] || "").trim() : "",
  })).filter((contact) => !!contact.name && (!!contact.phone || !!contact.email));
}
function localDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function Customers() {
  const { customers: demoCustomers, demoMode, businessId } = useStore();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<ContactDraft>({ name: "", phone: "", email: "", notes: "" });
  const [draftText, setDraftText] = useState("");
  const [draftContact, setDraftContact] = useState<Contact | null>(null);
  const [draftError, setDraftError] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [scheduleContact, setScheduleContact] = useState<Contact | null>(null);
  const [scheduleAt, setScheduleAt] = useState(() => localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [scheduleReason, setScheduleReason] = useState("Customer follow-up");
  const [scheduleConsent, setScheduleConsent] = useState(false);

  const loadBusinessData = useCallback(async () => {
    if (demoMode || !businessId || !supabase) {
      setContacts([]);
      setFollowups([]);
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const [contactResult, followupResult] = await Promise.all([
        supabase.from("twiga_customers").select("id,name,phone,email,notes,created_at").eq("business_id", businessId).order("created_at", { ascending: false }).limit(500),
        supabase.from("twiga_followups").select("id,customer_name,phone_number,task,channel,due_at,status,consent_status").eq("business_id", businessId).neq("status", "completed").order("due_at", { ascending: true }).limit(50),
      ]);
      if (contactResult.error) throw contactResult.error;
      setContacts((contactResult.data || []) as Contact[]);
      setFollowups(followupResult.error ? [] : (followupResult.data || []) as FollowUp[]);
      if (followupResult.error) setMessage("Contacts loaded. The follow-up queue could not be loaded: " + followupResult.error.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The business contact list could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [businessId, demoMode]);

  useEffect(() => { void loadBusinessData(); }, [loadBusinessData]);

  const addContact = async () => {
    if (!supabase || !businessId || !draft.name.trim()) {
      setMessage("Enter a contact name and select a live business workspace.");
      return;
    }
    const phone = draft.phone.trim() ? normalizePhone(draft.phone) : "";
    if (draft.phone.trim() && !phone) { setMessage("Enter a valid Kenyan or international phone number."); return; }
    if (!phone && !draft.email.trim()) { setMessage("Add a phone number or email address for this contact."); return; }
    setSaving(true); setMessage("");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Sign in again before adding contacts.");
      const { error } = await supabase.from("twiga_customers").insert({
        business_id: businessId, created_by: authData.user.id, name: draft.name.trim(),
        phone: phone || null, email: draft.email.trim() || null, notes: draft.notes.trim() || null,
      });
      if (error) throw error;
      setDraft({ name: "", phone: "", email: "", notes: "" });
      setShowAdd(false);
      setMessage("Contact saved to this business's People list.");
      await loadBusinessData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The contact could not be saved.");
    } finally { setSaving(false); }
  };

  const importContacts = async (file?: File) => {
    if (!file || !supabase || !businessId) return;
    setSaving(true); setMessage("Reading contact list…");
    try {
      const parsed = parseContactsCsv(await file.text());
      const unique = Array.from(new Map(parsed.map((contact) => [(contact.phone || contact.email).toLowerCase(), contact])).values());
      if (!unique.length) throw new Error("No contacts found. Use CSV columns named Name, Phone and optional Email.");
      if (unique.length > 500) throw new Error("Import up to 500 contacts per file.");
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Sign in again before importing contacts.");
      const phoneValues = unique.map((contact) => contact.phone).filter(Boolean);
      const emailValues = unique.map((contact) => contact.email).filter(Boolean);
      const [existingPhones, existingEmails] = await Promise.all([
        phoneValues.length ? supabase.from("twiga_customers").select("phone").eq("business_id", businessId).in("phone", phoneValues) : Promise.resolve({ data: [], error: null } as any),
        emailValues.length ? supabase.from("twiga_customers").select("email").eq("business_id", businessId).in("email", emailValues) : Promise.resolve({ data: [], error: null } as any),
      ]);
      if (existingPhones.error) throw existingPhones.error;
      if (existingEmails.error) throw existingEmails.error;
      const knownPhones = new Set((existingPhones.data || []).map((item: any) => String(item.phone || "")));
      const knownEmails = new Set((existingEmails.data || []).map((item: any) => String(item.email || "").toLowerCase()));
      const rows = unique.filter((contact) => !(contact.phone && knownPhones.has(contact.phone)) && !(contact.email && knownEmails.has(contact.email.toLowerCase())))
        .map((contact) => ({ business_id: businessId, created_by: authData.user!.id, name: contact.name, phone: contact.phone || null, email: contact.email || null, notes: contact.notes || null }));
      if (!rows.length) {
        setMessage("All " + unique.length + " contacts in this file already exist in this business.");
      } else {
        const { error } = await supabase.from("twiga_customers").insert(rows);
        if (error) throw error;
        setMessage(rows.length + " new contact(s) imported. Existing contacts were skipped.");
      }
      await loadBusinessData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The contact file could not be imported.");
    } finally { setSaving(false); }
  };

  const draftFollowup = async (contact: Contact) => {
    if (!supabase || !businessId) { setDraftError("Choose a signed-in business workspace first."); return; }
    setDraftBusy(true); setDraftError(""); setDraftText(""); setDraftContact(contact);
    try {
      const { data, error } = await supabase.functions.invoke("twiga-customer-followup", { body: { businessId, customerId: contact.id } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setDraftText(String(data?.draft || ""));
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "The follow-up could not be drafted.");
    } finally { setDraftBusy(false); }
  };

  const scheduleCustomerCall = async () => {
    if (!scheduleContact || !scheduleContact.phone || !supabase || !businessId) return;
    if (!scheduleConsent) { setMessage("Confirm that this contact agreed to receive this call before scheduling."); return; }
    const when = new Date(scheduleAt);
    if (!Number.isFinite(when.getTime()) || when.getTime() < Date.now() + 30000) { setMessage("Choose a future call time at least 30 seconds from now."); return; }
    setSaving(true); setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("twiga-scheduled-calls", { body: {
        action: "schedule", businessId, contacts: [{ name: scheduleContact.name, phone: scheduleContact.phone }],
        reason: scheduleReason.trim() || "Customer follow-up", scheduledAt: when.toISOString(),
        repeat: "none", repeatCount: 1, timezone: "Africa/Nairobi", authorised: true,
        triggerType: "follow_up", retryOnNoAnswer: true, callingWindowStart: "08:00", callingWindowEnd: "20:00",
      }});
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      await supabase.from("twiga_followups").insert({
        business_id: businessId, customer_name: scheduleContact.name, phone_number: scheduleContact.phone,
        task: scheduleReason.trim() || "Customer follow-up", channel: "phone", due_at: when.toISOString(),
        status: "pending", consent_status: "opted_in",
      });
      setMessage(data?.message || "Customer follow-up call scheduled.");
      setScheduleContact(null); setScheduleConsent(false);
      await loadBusinessData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The follow-up call could not be scheduled.");
    } finally { setSaving(false); }
  };

  const completeFollowup = async (item: FollowUp) => {
    if (!supabase || !businessId) return;
    setSaving(true); setMessage("");
    try {
      const { error } = await supabase.from("twiga_followups").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", item.id).eq("business_id", businessId);
      if (error) throw error;
      setMessage("Follow-up marked as complete.");
      await loadBusinessData();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The follow-up could not be updated.");
    } finally { setSaving(false); }
  };

  const visibleContacts = useMemo(() => {
    const rows = demoMode ? demoCustomers.map((item) => ({ id: item.id, name: item.name, phone: item.phone === "Demo only" ? null : item.phone, email: null, notes: null, created_at: "" })) : contacts;
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((item) => [item.name, item.phone || "", item.email || "", item.notes || ""].some((value) => value.toLowerCase().includes(term)));
  }, [contacts, demoCustomers, demoMode, search]);

  const due = followups.filter((item) => Date.parse(item.due_at) <= Date.now()).length;
  const demoDue = demoMode ? demoCustomers.filter((item) => item.followUpIn === 0).length : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-400">Business relationships</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-white">People & contacts</h1>
          <p className="mt-1 text-sm text-neutral-300">Contacts saved here belong only to this business workspace.</p>
        </div>
        <div className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-neutral-300">Due follow-ups</p>
          <p className="text-lg font-bold text-orange-400">{demoMode ? demoDue : due}</p>
        </div>
      </header>

      {!demoMode && <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-neutral-950">Business contact list</h2><p className="mt-1 text-sm text-neutral-600">Add contacts manually or import a CSV. Imported phone numbers can be used in scheduled AI calls.</p></div>
          <div className="flex flex-wrap gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-xl border border-neutral-300 bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800">
              Import CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" disabled={saving || !businessId} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void importContacts(file); }} />
            </label>
            <button onClick={() => setShowAdd((value) => !value)} className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-orange-600">{showAdd ? "Close" : "Add contact"}</button>
            <button onClick={() => void loadBusinessData()} disabled={loading || saving} className="rounded-xl border border-neutral-300 px-3 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">Refresh</button>
          </div>
        </div>
        {showAdd && <div className="mt-4 grid gap-3 rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-neutral-800">Contact name<input value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5" placeholder="Full name" /></label>
          <label className="text-sm font-medium text-neutral-800">Phone number<input value={draft.phone} onChange={(event) => setDraft((value) => ({ ...value, phone: event.target.value }))} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5" placeholder="+2547…" /></label>
          <label className="text-sm font-medium text-neutral-800">Email address<input type="email" value={draft.email} onChange={(event) => setDraft((value) => ({ ...value, email: event.target.value }))} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5" placeholder="customer@example.com" /></label>
          <label className="text-sm font-medium text-neutral-800">Notes<input value={draft.notes} onChange={(event) => setDraft((value) => ({ ...value, notes: event.target.value }))} className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5" placeholder="Optional notes" /></label>
          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-neutral-600">Customer records are private to this business.</p><button onClick={() => void addContact()} disabled={saving || !draft.name.trim()} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{saving ? "Saving…" : "Save contact"}</button></div>
        </div>}
        <div className="mt-4"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, email or notes" className="h-11 w-full rounded-xl border border-neutral-300 px-3 text-sm text-neutral-900 placeholder:text-neutral-500" /></div>
        {loading && <p className="mt-4 text-sm text-neutral-600">Loading business contacts…</p>}
        {!loading && visibleContacts.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center text-sm text-neutral-700">No contacts saved yet. Add a contact or import a CSV to start your business list.</p>}
        {!loading && visibleContacts.length > 0 && <div className="mt-4 space-y-2">
          {visibleContacts.map((contact) => <article key={contact.id} className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-sm font-bold text-white">{contact.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div>
            <div className="min-w-0 flex-1"><p className="font-semibold text-neutral-950">{contact.name}</p><p className="mt-1 text-xs text-neutral-600">{contact.phone || "No phone"}{contact.email ? " · " + contact.email : ""}</p>{contact.notes && <p className="mt-1 text-xs text-neutral-600">{contact.notes}</p>}</div>
            {!demoMode && <div className="flex flex-wrap gap-2">
              <button onClick={() => void draftFollowup(contact as Contact)} disabled={draftBusy || !contact.phone} className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40"><IconSparkle className="mr-1 inline h-3.5 w-3.5 text-orange-500" />{draftBusy && draftContact?.id === contact.id ? "Drafting…" : "Draft follow-up"}</button>
              <button onClick={() => { setScheduleContact(contact as Contact); setScheduleConsent(false); setScheduleReason("Customer follow-up"); }} disabled={!contact.phone} className="rounded-lg bg-neutral-950 px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"><IconPhone className="mr-1 inline h-3.5 w-3.5" />Schedule AI call</button>
            </div>}
          </article>)}
        </div>}
      </section>}

      {demoMode && <section className="rounded-2xl border border-neutral-200 bg-white p-5"><h2 className="font-semibold text-neutral-950">Sample contacts</h2><p className="mt-1 text-sm text-neutral-600">These are example records only. Sign in and open a business workspace to manage real contacts.</p>{visibleContacts.map((contact) => <div key={contact.id} className="mt-3 rounded-xl border border-neutral-200 p-3"><p className="font-semibold text-neutral-900">{contact.name}</p><p className="text-xs text-neutral-500">{contact.phone || "No phone"}</p></div>)}</section>}

      {scheduleContact && <section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 text-white">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-orange-400">Authorised follow-up</p><h2 className="mt-1 text-lg font-semibold text-white">Schedule a call to {scheduleContact.name}</h2><p className="mt-1 text-sm text-neutral-300">{scheduleContact.phone}</p></div><button onClick={() => setScheduleContact(null)} className="text-sm font-semibold text-neutral-300 underline">Close</button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-neutral-200">Call time<input type="datetime-local" value={scheduleAt} onChange={(event) => setScheduleAt(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-white" /></label>
          <label className="text-sm font-medium text-neutral-200">Reason<input value={scheduleReason} onChange={(event) => setScheduleReason(event.target.value)} className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-white" /></label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-neutral-200"><input type="checkbox" checked={scheduleConsent} onChange={(event) => setScheduleConsent(event.target.checked)} className="mt-1" /><span>I confirm this contact agreed to receive this call for the stated purpose.</span></label>
        <button onClick={() => void scheduleCustomerCall()} disabled={saving || !scheduleConsent || !scheduleContact.phone} className="mt-4 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-neutral-950 disabled:opacity-40">{saving ? "Scheduling…" : "Confirm and schedule AI call"}</button>
      </section>}

      {(draftText || draftError || draftBusy) && <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">AI follow-up draft</p><h2 className="mt-1 text-lg font-semibold text-neutral-950">{draftContact?.name || "Customer message"}</h2><p className="mt-1 text-xs text-neutral-600">Review the message before using it. TWIGA does not send it automatically.</p></div><Badge className="border-neutral-300 bg-neutral-100 text-neutral-800">Draft only</Badge></div>
        {draftBusy && <p className="mt-4 text-sm text-neutral-700">Preparing a follow-up from this business's saved customer and call context…</p>}
        {draftText && <><textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} rows={4} className="mt-4 w-full rounded-xl border border-neutral-300 bg-white p-3 text-sm leading-6 text-neutral-900" /><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => void navigator.clipboard.writeText(draftText)} className="bg-neutral-950 text-white hover:bg-neutral-800">Copy message</Button><Button variant="outline" onClick={() => { setDraftText(""); setDraftContact(null); }}>Close draft</Button></div></>}
        {draftError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{draftError}</p>}
      </section>}

      {!demoMode && <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-none">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-neutral-950">Follow-up queue</h2><p className="mt-1 text-sm text-neutral-600">Calls scheduled for a person appear here until marked complete.</p></div><Badge className="border-neutral-300 bg-neutral-100 text-neutral-800">{followups.length} open</Badge></div>
        {followups.length === 0 && <p className="mt-4 rounded-xl bg-neutral-50 p-4 text-center text-sm text-neutral-700">No follow-ups are waiting.</p>}
        <div className="mt-3 space-y-2">
          {followups.map((item) => <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-semibold text-neutral-900">{item.customer_name || item.phone_number}</p><p className="text-xs text-neutral-600">{item.task} · {new Date(item.due_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</p><p className="text-xs text-neutral-500">{item.channel} · consent: {item.consent_status}</p></div><Button size="sm" variant="outline" disabled={saving} onClick={() => void completeFollowup(item)} className="border-neutral-300 text-neutral-800 hover:bg-neutral-50">Mark complete</Button></div>)}
        </div>
      </section>}

      {message && <p role="status" className="rounded-xl border border-neutral-300 bg-neutral-100 p-3 text-sm text-neutral-800">{message}</p>}
    </div>
  );
}
