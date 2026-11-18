import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useStore, type Customer } from "@/lib/store";
import {
  IconUsers,
  IconPhone,
  IconSend,
  IconClock,
  IconSparkle,
  IconAlert,
  IconTrend,
} from "@/components/Icons";

const stageMeta: Record<
  Customer["stage"],
  { chip: string; icon: typeof IconUsers }
> = {
  VIP: { chip: "border-orange-200 bg-orange-50 text-orange-600", icon: IconTrend },
  Active: { chip: "border-neutral-200 bg-neutral-100 text-neutral-700", icon: IconSparkle },
  "At Risk": { chip: "border-neutral-900 bg-neutral-950 text-white", icon: IconAlert },
  New: { chip: "border-neutral-200 bg-white text-neutral-600", icon: IconUsers },
};

export default function Customers() {
  const { customers, advanceCustomer, businessId, demoMode } = useStore();
  const [draftCustomerId, setDraftCustomerId] = useState("");
  const [draftCustomerName, setDraftCustomerName] = useState("");
  const [draftText, setDraftText] = useState("");
  const [draftError, setDraftError] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [cloudContacts, setCloudContacts] = useState<any[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactsBusy, setContactsBusy] = useState(false);
  const [contactsMessage, setContactsMessage] = useState("");

  const cloudflareContacts = useCallback(async (action: "listContacts" | "saveContacts", data: Record<string, unknown>) => {
    if (!supabase || !businessId) throw new Error("Choose a signed-in business workspace first.");
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) throw new Error("Your sign-in has expired. Sign in again.");
    const response = await fetch("https://twiga-api.twiga-ke.workers.dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: sessionData.session.access_token,
        business_id: businessId,
        action,
        data,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.ok !== true) throw new Error(String(result?.error || "Cloudflare could not complete the contact operation."));
    return result;
  }, [businessId]);

  const loadCloudContacts = useCallback(async () => {
    if (demoMode || !businessId) { setCloudContacts([]); return; }
    const result = await cloudflareContacts("listContacts", { q: contactSearch.trim(), limit: 200 });
    setCloudContacts(Array.isArray(result.contacts) ? result.contacts : []);
  }, [businessId, cloudflareContacts, contactSearch, demoMode]);

  useEffect(() => {
    void loadCloudContacts().catch((error) => setContactsMessage(error instanceof Error ? error.message : "Could not load business contacts."));
  }, [loadCloudContacts]);

  const importGoogleContacts = async () => {
    if (demoMode || !supabase || !businessId) { setContactsMessage("Sign in and select a live business workspace to import contacts."); return; }
    setContactsBusy(true); setContactsMessage("Importing Google Contacts into this business's private Cloudflare contacts store…");
    try {
      const { data, error } = await supabase.functions.invoke("google-workspace", { body: { action: "contacts.import", businessId, limit: 500 } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      await loadCloudContacts();
      setContactsMessage(String(data?.message || (Number(data?.imported || 0) + " contacts imported from Google.")));
    } catch (error) {
      setContactsMessage(error instanceof Error ? error.message : "Google Contacts import failed. Connect Google Contacts in Connections & permissions first.");
    } finally { setContactsBusy(false); }
  };

  const parseCsv = (raw: string) => {
    const rows: string[][] = [];
    let row: string[] = [], cell = "", quoted = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '"' && quoted && raw[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = !quoted;
      else if (ch === "," && !quoted) { row.push(cell.trim()); cell = ""; }
      else if ((ch === "\n" || ch === "\r") && !quoted) {
        if (ch === "\r" && raw[i + 1] === "\n") i++;
        row.push(cell.trim()); cell = "";
        if (row.some(Boolean)) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
    if (rows.length < 2) return [];
    const headers = rows[0].map((x) => x.toLowerCase().replace(/[^a-z]/g, ""));
    const nameIndex = headers.findIndex((x) => ["name","fullname","contactname"].includes(x));
    const phoneIndex = headers.findIndex((x) => ["phone","phonenumber","mobile","whatsapp"].includes(x));
    const emailIndex = headers.findIndex((x) => ["email","emailaddress"].includes(x));
    return rows.slice(1).map((r) => ({
      name: r[nameIndex >= 0 ? nameIndex : 0] || "",
      phone: r[phoneIndex >= 0 ? phoneIndex : 1] || "",
      email: r[emailIndex >= 0 ? emailIndex : 2] || "",
    })).filter((x) => x.name && x.phone);
  };

  const importCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setContactsBusy(true); setContactsMessage("Reading CSV contacts…");
    try {
      const contacts = parseCsv(await file.text()).slice(0, 500);
      if (!contacts.length) throw new Error("No contacts found. CSV needs a name and phone column (email is optional).");
      const result = await cloudflareContacts("saveContacts", { contacts, source: "csv" });
      await loadCloudContacts();
      setContactsMessage(String(result.saved || 0) + " contact(s) imported into this business's Cloudflare contacts store.");
    } catch (error) {
      setContactsMessage(error instanceof Error ? error.message : "CSV import failed.");
    } finally { setContactsBusy(false); }
  };

  const addManualContact = async () => {
    if (!contactName.trim() || !contactPhone.trim()) { setContactsMessage("Enter a name and phone number."); return; }
    setContactsBusy(true); setContactsMessage("");
    try {
      const result = await cloudflareContacts("saveContacts", { contacts: [{ name: contactName.trim(), phone: contactPhone.trim(), email: contactEmail.trim() }], source: "manual" });
      setContactName(""); setContactPhone(""); setContactEmail("");
      await loadCloudContacts();
      setContactsMessage(Number(result.saved || 0) > 0 ? "Contact saved to this business's Cloudflare contacts store." : "Contact was not added. Check that its phone number is valid.");
    } catch (error) { setContactsMessage(error instanceof Error ? error.message : "Could not save contact."); }
    finally { setContactsBusy(false); }
  };

  const draftFollowup = async (customer: Customer) => {
    if (demoMode) {
      setDraftCustomerId(customer.id); setDraftCustomerName(customer.name);
      setDraftError("");
      setDraftText("Hi " + customer.name.split(" ")[0] + ", karibu back! We hope you enjoyed your last visit. Would you like us to help you book your next appointment or answer any questions? Reply whenever convenient. This is a sample draft only; no message has been sent.");
      return;
    }
    if (!supabase || !businessId) { setDraftError("Choose a signed-in business workspace first."); return; }
    setDraftBusy(true); setDraftError(""); setDraftText(""); setDraftCustomerId(customer.id); setDraftCustomerName(customer.name);
    try {
      const { data, error } = await supabase.functions.invoke("twiga-customer-followup", { body: { businessId, customerId: customer.id } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setDraftText(String(data?.draft || ""));
    } catch (error) {
      setDraftError(error instanceof Error ? error.message : "Grok could not draft this follow-up.");
    } finally { setDraftBusy(false); }
  };

  const due = customers.filter((c) => c.followUpIn === 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
            Relationships
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            Customers
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Rows ready for follow-ups and outreach
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
          <IconClock className="h-5 w-5 text-orange-500" />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              Due now
            </p>
            <p className="text-lg font-bold text-orange-600">{due} people</p>
          </div>
        </div>
      </div>

      <Card className="rounded-2xl border-neutral-200 shadow-sm">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2 text-xl font-semibold"><IconUsers className="h-5 w-5 text-orange-500" /> People & contacts</CardTitle>
            <CardDescription>Business contacts are stored separately for each client in Cloudflare D1.</CardDescription></div>
          <Badge className="border-neutral-200 bg-neutral-50 text-neutral-700">{cloudContacts.length} contacts</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void importGoogleContacts()} disabled={contactsBusy || demoMode} className="bg-neutral-950 text-white">Import Google Contacts</Button>
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
              Import CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => void importCsv(e)} disabled={contactsBusy || demoMode} />
            </label>
            <Button variant="outline" onClick={() => void loadCloudContacts()} disabled={contactsBusy || demoMode}>Refresh</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact name" className="h-10 rounded-lg border border-neutral-200 px-3 text-sm" />
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+2547XXXXXXXX" className="h-10 rounded-lg border border-neutral-200 px-3 text-sm" />
            <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="Email (optional)" className="h-10 rounded-lg border border-neutral-200 px-3 text-sm" />
            <Button onClick={() => void addManualContact()} disabled={contactsBusy || demoMode} className="bg-orange-500 text-white hover:bg-orange-600">Add contact</Button>
          </div>
          <input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Search saved contacts by name or phone…" className="h-10 w-full rounded-lg border border-neutral-200 px-3 text-sm" />
          {contactsMessage && <p role="status" className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600">{contactsMessage}</p>}
          <div className="space-y-2">
            {cloudContacts.length === 0 && <p className="rounded-xl border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-500">{demoMode ? "Contact imports are disabled in demo mode." : "No imported contacts yet. Import Google Contacts or upload a CSV file."}</p>}
            {cloudContacts.map((person: any, i: number) => <div key={person.Phone || person.phone || i} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-100 px-3 py-2.5">
              <div><p className="text-sm font-semibold text-neutral-900">{person.Name || person.name || "Contact"}</p><p className="mt-0.5 text-xs text-neutral-500">{person.Phone || person.phone || ""}{(person.Email || person.email) ? " · " + (person.Email || person.email) : ""}</p></div>
              <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] font-semibold text-neutral-500">Cloudflare · {person.Source || person.source || "Contact"}</span>
            </div>)}
          </div>
          <p className="text-xs leading-5 text-neutral-400">Google import requires Google Contacts to be connected in Connections & permissions. CSV headers can be name, phone and email. Only contacts with a usable phone number are imported into the current index.</p>
        </CardContent>
      </Card>

      {(draftText || draftError || draftBusy) && <section className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Grok · Customer follow-up</p><h2 className="mt-1 text-lg font-semibold text-neutral-950">{draftCustomerName || "Customer message"}</h2><p className="mt-1 text-xs text-neutral-500">Drafted from this business's profile, instructions and recent call context. Review before sending.</p></div><Badge className="border-neutral-200 bg-neutral-50 text-neutral-700">Draft only</Badge></div>
        {draftBusy && <p className="mt-4 text-sm text-neutral-500">Grok is reviewing this business's customer context…</p>}
        {draftText && <><textarea value={draftText} onChange={(e) => setDraftText(e.target.value)} rows={4} className="mt-4 w-full rounded-xl border border-neutral-200 p-3 text-sm leading-6 outline-none focus:border-orange-400" /><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => void navigator.clipboard.writeText(draftText)} className="bg-neutral-950 text-white">Copy message</Button><Button variant="outline" onClick={() => { setDraftText(""); setDraftCustomerId(""); setDraftCustomerName(""); }}>Close draft</Button></div></>}
        {draftError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{draftError}</p>}
      </section>}

      <Card className="rounded-2xl border-neutral-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <IconUsers className="h-5 w-5 text-orange-500" /> Customer Pipeline
            </CardTitle>
            <CardDescription>Tap follow up to advance the relationship</CardDescription>
          </div>
          <Badge className="border-neutral-900 bg-neutral-950 text-white">
            {customers.length} people
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          {customers.map((c) => {
            const meta = stageMeta[c.stage];
            const StageIcon = meta.icon;
            const isDue = c.followUpIn === 0;
            return (
              <div
                key={c.id}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border px-4 py-3 transition-colors sm:flex-row sm:items-center",
                  isDue
                    ? "border-orange-200 bg-orange-50/60"
                    : "border-neutral-100 bg-white hover:border-neutral-200 hover:bg-neutral-50"
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-950 text-sm font-bold text-white">
                  {c.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">
                    {c.name}
                  </p>
                  <p className="flex items-center gap-1 truncate text-xs text-neutral-500">
                    <IconPhone className="h-3 w-3" /> {c.phone} · last visit {c.lastVisit}
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold text-neutral-900">
                    KSh {c.spend.toLocaleString()}
                  </p>
                  <p className="text-xs text-neutral-500">lifetime</p>
                </div>
                <Badge className={cn("border", meta.chip)}>
                  <StageIcon className="mr-1 h-3 w-3" /> {c.stage}
                </Badge>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      isDue ? "font-medium text-orange-600" : "text-neutral-400"
                    )}
                  >
                    <IconClock className="h-3 w-3" />
                    {isDue ? "Due now" : `in ${c.followUpIn}d`}
                  </span>
                  <Button size="sm" variant="outline" disabled={draftBusy} onClick={() => void draftFollowup(c)} className="border-orange-200 text-orange-700 hover:bg-orange-50"><IconSparkle className="mr-1 h-3.5 w-3.5" /> {draftBusy && draftCustomerId === c.id ? "Drafting…" : "Grok draft"}</Button>
                  <Button
                    size="sm"
                    onClick={() => advanceCustomer(c.id)}
                    className={cn(
                      isDue
                        ? "bg-orange-500 text-white hover:bg-orange-600"
                        : "bg-neutral-950 text-white hover:bg-neutral-800"
                    )}
                  >
                    <IconSend className="mr-1 h-3.5 w-3.5" /> Follow up
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}