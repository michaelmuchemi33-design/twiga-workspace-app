import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Row = Record<string, any>;
const money = (value: unknown) => "KSh " + Number(value || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 });
const date = (value: unknown) => value ? new Date(String(value)).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function PlatformAdminConsole() {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<Row>({});
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [accessStatus, setAccessStatus] = useState("TRIAL");
  const [paidThrough, setPaidThrough] = useState("");
  const [extendDays, setExtendDays] = useState("30");
  const [paymentAmount, setPaymentAmount] = useState("1650");
  const [subscriptionPlan, setSubscriptionPlan] = useState("starter");
  const [subscriptionPhone, setSubscriptionPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("mpesa");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [ticketDetail, setTicketDetail] = useState<Row | null>(null);
  const [ticketReply, setTicketReply] = useState("");
  const [ticketBusy, setTicketBusy] = useState(false);
  const [providerToAssign, setProviderToAssign] = useState("sautikit");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [providerMessage, setProviderMessage] = useState("");

  const callAdmin = useCallback(async (action: string, payload: Row = {}) => {
    if (!supabase) throw new Error("TWIGA is not connected to Supabase.");
    const { data, error: invokeError } = await supabase.functions.invoke("twiga-platform-admin", { body: { action, ...payload } });
    if (invokeError) throw new Error(invokeError.message);
    if (data?.error) throw new Error(String(data.error));
    return data || {};
  }, []);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); setError("TWIGA is not connected to Supabase."); return; }
    setLoading(true); setError("");
    try {
      const { data: auth, error: authError } = await supabase.functions.invoke("twiga-platform-secrets", { body: { action: "get_config" } });
      if (authError) throw new Error(authError.message);
      if (auth?.isAdmin !== true) { setAllowed(false); setLoading(false); return; }
      setAllowed(true);
      const data = await callAdmin("overview");
      setOverview(data);
      setSelectedBusinessId((current) => current || data.clients?.[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load platform administration.");
    } finally { setLoading(false); }
  }, [callAdmin]);

  useEffect(() => { void load(); }, [load]);

  const clients: Row[] = overview.clients || [];
  const tickets: Row[] = overview.tickets || [];
  const payments: Row[] = overview.payments || [];
  const subscriptionIntents: Row[] = overview.subscriptionIntents || [];
  const phoneLines: Row[] = overview.phoneLines || [];
  const recentCalls: Row[] = overview.recentCalls || [];
  const providerConnections: Row[] = overview.providerConnections || [];
  const auditLogs: Row[] = overview.auditLogs || [];
  const selectedClient = useMemo(() => clients.find((client) => client.id === selectedBusinessId), [clients, selectedBusinessId]);

  useEffect(() => {
    if (!selectedClient) return;
    setAccessStatus(String(selectedClient.status || "TRIAL").toUpperCase());
    setPaidThrough(String(selectedClient.paidThrough || ""));
  }, [selectedClient]);

  const saveBusinessProviderKey = async () => {
    if (!selectedBusinessId || !providerApiKey.trim()) {
      setProviderMessage("Select a business and enter its provider API key.");
      return;
    }
    const providerLabel = providerToAssign === "sautikit" ? "SautiKit" : "PalPluss";
    if (!window.confirm("Validate and save the " + providerLabel + " key for " + (selectedClient?.name || "the selected business") + "? It will be encrypted in Supabase Vault and will not be shown again.")) return;
    setBusy(true); setError(""); setProviderMessage(""); setNotice("");
    try {
      const result = await callAdmin("save_business_provider_secret", {
        businessId: selectedBusinessId,
        provider: providerToAssign,
        apiKey: providerApiKey.trim(),
      });
      setProviderApiKey("");
      setProviderMessage(String(result.message || providerLabel + " connection key saved securely.") + (result.keyLast4 ? " Key ending " + result.keyLast4 + "." : ""));
      setOverview(await callAdmin("overview"));
      setNotice("Provider credentials were validated, encrypted and assigned to the selected workspace.");
    } catch (cause) {
      setProviderMessage(cause instanceof Error ? cause.message : "Could not save this provider key.");
    } finally { setBusy(false); }
  };

  const openTicket = async (ticketId: string) => {
    setSelectedTicketId(ticketId); setTicketBusy(true); setTicketDetail(null); setError("");
    try { setTicketDetail(await callAdmin("ticket_messages", { ticketId })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open the support ticket."); }
    finally { setTicketBusy(false); }
  };

  const replyToTicket = async () => {
    if (!selectedTicketId || !ticketReply.trim()) return;
    setTicketBusy(true); setError("");
    try {
      await callAdmin("reply_ticket", { ticketId: selectedTicketId, message: ticketReply.trim() });
      setTicketReply("");
      await openTicket(selectedTicketId);
      const refreshed = await callAdmin("overview"); setOverview(refreshed);
      setNotice("Your reply was saved to the support conversation.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send the support reply."); }
    finally { setTicketBusy(false); }
  };

  const updateTicketStatus = async (status: string) => {
    if (!selectedTicketId) return;
    setTicketBusy(true); setError("");
    try {
      await callAdmin("update_ticket", { ticketId: selectedTicketId, status });
      await openTicket(selectedTicketId);
      setOverview(await callAdmin("overview"));
      setNotice("Support ticket updated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update support ticket."); }
    finally { setTicketBusy(false); }
  };

  const saveAccess = async () => {
    if (!selectedBusinessId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await callAdmin("set_access", { businessId: selectedBusinessId, status: accessStatus, paidThrough: paidThrough || null });
      setOverview(await callAdmin("overview")); setNotice("Client access settings saved and audited.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update client access."); }
    finally { setBusy(false); }
  };

  const addDays = async () => {
    const days = Number(extendDays);
    if (!selectedBusinessId || !Number.isInteger(days) || days < 1 || days > 1000) { setError("Enter between 1 and 1000 days."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await callAdmin("extend_access_days", { businessId: selectedBusinessId, days });
      setOverview(await callAdmin("overview")); setPaidThrough(String(result.paidThrough || "")); setAccessStatus("ACTIVE");
      setNotice("Added " + days + " days. Access now runs through " + String(result.paidThrough || "the updated subscription date") + ".");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not extend access."); }
    finally { setBusy(false); }
  };

  const recordPayment = async () => {
    const amount = Number(paymentAmount);
    if (!selectedBusinessId || !Number.isFinite(amount) || amount <= 0 || !paymentReference.trim()) {
      setError("Choose a client, enter a positive amount and add the verified payment reference."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      await callAdmin("record_payment", { businessId: selectedBusinessId, amount, method: paymentMethod, reference: paymentReference.trim(), notes: paymentNotes.trim() });
      setPaymentReference(""); setPaymentNotes("");
      setOverview(await callAdmin("overview"));
      setNotice("Verified payment was recorded and client access was updated.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record the payment."); }
    finally { setBusy(false); }
  };

  const requestSubscriptionPayment = async () => {
    if (!selectedBusinessId || !subscriptionPhone.trim()) { setError("Select a client and enter the customer's Kenyan M-Pesa phone number."); return; }
    const price = subscriptionPlan === "starter" ? 1650 : subscriptionPlan === "professional" ? 3000 : 5000;
    if (!window.confirm("Send an M-Pesa prompt for KSh " + price.toLocaleString("en-KE") + " to " + subscriptionPhone + " for " + (selectedClient?.name || "this business") + "? Access changes only after PalPluss verifies SUCCESS.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (!supabase) throw new Error("TWIGA is not connected to Supabase.");
      const { data, error: invokeError } = await supabase.functions.invoke("twiga-subscription-billing", {
        body: { action: "admin_create_stk", businessId: selectedBusinessId, planCode: subscriptionPlan, phone: subscriptionPhone.trim() }
      });
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(String(data.error));
      setNotice(String(data?.message || "Subscription M-Pesa request was created. Waiting for provider confirmation."));
      setOverview(await callAdmin("overview"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not request the subscription payment."); }
    finally { setBusy(false); }
  };

  const verifySubscriptionIntent = async (businessId: string, intentId: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      if (!supabase) throw new Error("TWIGA is not connected to Supabase.");
      const { data, error: invokeError } = await supabase.functions.invoke("twiga-subscription-billing", {
        body: { action: "admin_refresh", businessId, intentId }
      });
      if (invokeError) throw new Error(invokeError.message);
      if (data?.error) throw new Error(String(data.error));
      setNotice(String(data?.message || (data?.paid ? "Subscription payment verified." : "Payment is not confirmed yet.")));
      setOverview(await callAdmin("overview"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not verify the subscription payment."); }
    finally { setBusy(false); }
  };

  if (loading) return <section className="rounded-2xl border border-neutral-200 bg-white p-5 text-sm text-neutral-500">Checking platform administrator access…</section>;
  if (!allowed) return null;

  const metrics = overview.metrics || {};
  const lineFor = (businessId: string) => phoneLines.filter((line) => line.business_id === businessId);
  const providersFor = (businessId: string) => providerConnections.filter((item) => item.business_id === businessId).map((item) => String(item.provider || "provider") + (item.secret_last4 ? " · ••••" + String(item.secret_last4) : "")).join(", ") || "None registered";

  return <section className="space-y-5 rounded-2xl border border-neutral-300 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[.18em] text-orange-600">TWIGA · restricted administrator access</p><h2 className="mt-1 text-2xl font-bold text-neutral-950">Platform control centre</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-neutral-600">Customer directory, subscriptions, verified payments, phone health, provider connections, support conversations and an audit trail. Access is checked by the server for every action.</p></div>
      <button onClick={() => void load()} disabled={loading} className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 disabled:opacity-40">Refresh platform</button>
    </div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[
        ["Businesses", metrics.clientCount ?? overview.totalClientCount ?? clients.length],
        ["First 10 customers", Math.min(10, metrics.clientCount ?? clients.length) + " / 10"],
        ["Payments recorded", metrics.paymentCount ?? payments.length],
        ["Total received", money(metrics.paidTotalKes)],
        ["Open support", metrics.openTickets ?? tickets.filter((t) => t.status !== "resolved").length],
        ["Phone lines", metrics.phoneLineCount ?? phoneLines.length],
        ["Inbound enabled", metrics.inboundEnabled ?? 0],
        ["Outbound enabled", metrics.outboundEnabled ?? 0],
        ["Recent calls", metrics.recentCallCount ?? recentCalls.length],
        ["Failed calls", metrics.failedCalls ?? 0],
      ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">{label}</p><p className="mt-1 text-xl font-bold tabular-nums text-neutral-950">{value}</p></div>)}
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.3fr_.9fr]">
      <div className="min-w-0 rounded-xl border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-neutral-950">All customer businesses</h3><span className="text-xs text-neutral-500">Showing {clients.length} of {overview.totalClientCount ?? clients.length} · limit {overview.clientsLimit || 500}</span></div>
        <div className="mt-3 max-h-[420px] overflow-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="sticky top-0 bg-neutral-100 text-neutral-600"><tr><th className="p-2">Business / owner</th><th className="p-2">Plan</th><th className="p-2">Access</th><th className="p-2">Paid through</th><th className="p-2">Phone</th><th className="p-2">Connections</th></tr></thead>
            <tbody>{clients.map((client) => <tr key={client.id} onClick={() => setSelectedBusinessId(client.id)} className={"cursor-pointer border-t border-neutral-100 hover:bg-orange-50 " + (selectedBusinessId === client.id ? "bg-orange-50" : "")}>
              <td className="p-2"><p className="font-semibold text-neutral-900">{client.name}</p><p className="mt-0.5 text-neutral-500">{client.ownerEmail || "No owner email"} · {client.memberCount || 0} members</p></td>
              <td className="p-2 text-neutral-700">{client.planCode || "—"}<p className="text-neutral-500">{client.subscriptionAmount == null ? "—" : money(client.subscriptionAmount)}</p></td>
              <td className="p-2"><span className="rounded-full bg-neutral-100 px-2 py-1 font-semibold">{client.status || "UNKNOWN"}</span></td>
              <td className="p-2 text-neutral-700">{client.paidThrough || (client.currentPeriodEnd ? date(client.currentPeriodEnd) : "—")}</td>
              <td className="p-2 text-neutral-700">{lineFor(client.id).map((line) => line.inbound_enabled ? "Inbound on" : "Inbound off").join(", ") || "No line"}</td>
              <td className="max-w-[160px] truncate p-2 text-neutral-700">{providersFor(client.id)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 p-4">
        <h3 className="font-semibold text-neutral-950">Manage selected client</h3>
        <p className="mt-1 text-xs text-neutral-500">{selectedClient ? selectedClient.name + " · " + (selectedClient.ownerEmail || "Owner email not set") : "Select a business from the directory."}</p>
        <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-sm font-semibold text-neutral-950">Business connections & environment keys</p>
          <p className="mt-1 text-xs leading-5 text-neutral-600">Assign a provider key to this business only. TWIGA validates it, stores it encrypted in Supabase Vault, and keeps it out of the customer’s browser and Worker environment.</p>
          <label className="mt-3 block text-xs font-semibold text-neutral-700">Provider
            <select value={providerToAssign} onChange={(event) => { setProviderToAssign(event.target.value); setProviderMessage(""); }} disabled={busy} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm text-neutral-900">
              <option value="sautikit">SautiKit · voice and phone</option>
              <option value="palpluss">PalPluss · payments</option>
            </select>
          </label>
          <label className="mt-3 block text-xs font-semibold text-neutral-700">Business API key
            <input type="password" autoComplete="new-password" spellCheck={false} value={providerApiKey} onChange={(event) => setProviderApiKey(event.target.value)} placeholder={providerToAssign === "sautikit" ? "Paste this business’s SautiKit key" : "Paste this business’s PalPluss key"} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900"/>
          </label>
          <button onClick={() => void saveBusinessProviderKey()} disabled={busy || !selectedBusinessId || !providerApiKey.trim()} className="mt-3 w-full rounded-lg bg-neutral-950 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Validating & saving…" : "Validate and assign key"}</button>
          {providerMessage && <p role="status" className="mt-2 rounded-lg bg-white p-2.5 text-xs leading-5 text-neutral-700">{providerMessage}</p>}
          <p className="mt-2 text-[11px] leading-5 text-neutral-500">Only the last four characters are retained for display. The full key is never returned to this screen. Other integrations can be added through the same isolated workspace connection model.</p>
        </div>
        <label className="mt-3 block text-xs font-semibold text-neutral-600">Access status<select value={accessStatus} onChange={(event) => setAccessStatus(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm"><option value="TRIAL">Trial</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></label>
        <label className="mt-3 block text-xs font-semibold text-neutral-600">Paid through<input type="date" value={paidThrough} onChange={(event) => setPaidThrough(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-2 text-sm"/></label>
        <button onClick={() => void saveAccess()} disabled={busy || !selectedBusinessId} className="mt-3 w-full rounded-lg bg-neutral-950 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Save access status</button>
        <div className="mt-4 border-t border-neutral-100 pt-3"><p className="text-xs font-semibold text-neutral-700">Extend access</p><div className="mt-2 flex gap-2"><input type="number" min="1" max="1000" value={extendDays} onChange={(event) => setExtendDays(event.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-neutral-200 px-2 text-sm"/><button onClick={() => void addDays()} disabled={busy || !selectedBusinessId} className="rounded-lg border border-neutral-200 px-3 text-xs font-semibold disabled:opacity-40">Add days</button></div></div>
        <div className="mt-4 border-t border-neutral-100 pt-3">
          <p className="text-xs font-semibold text-neutral-700">Request subscription M-Pesa payment</p>
          <p className="mt-1 text-xs leading-5 text-neutral-500">Send the selected client an M-Pesa STK prompt from TWIGA's central PalPluss account. Access is updated only after transaction verification.</p>
          <label className="mt-2 block text-xs text-neutral-600">Subscription plan<select value={subscriptionPlan} onChange={(event) => setSubscriptionPlan(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm"><option value="starter">Starter · KSh 1,650/month</option><option value="professional">Professional · KSh 3,000/month</option><option value="business_pro">Business Pro · KSh 5,000/month</option></select></label>
          <label className="mt-2 block text-xs text-neutral-600">Customer M-Pesa number<input type="tel" value={subscriptionPhone} onChange={(event) => setSubscriptionPhone(event.target.value)} placeholder="0712 345 678" className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-2 text-sm"/></label>
          <button onClick={() => void requestSubscriptionPayment()} disabled={busy || !selectedBusinessId || !subscriptionPhone.trim()} className="mt-3 w-full rounded-lg bg-orange-500 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Send subscription M-Pesa prompt</button>
        </div>
        <div className="mt-4 border-t border-neutral-100 pt-3"><p className="text-xs font-semibold text-neutral-700">Record an already verified offline payment</p><label className="mt-2 block text-xs text-neutral-600">Amount (KES)<input type="number" min="1" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-2 text-sm"/></label><label className="mt-2 block text-xs text-neutral-600">Method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 bg-white px-2 text-sm"><option value="mpesa">M-Pesa</option><option value="bank">Bank</option><option value="cash">Cash</option><option value="card">Card</option><option value="other">Other</option></select></label><label className="mt-2 block text-xs text-neutral-600">Verified payment reference<input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="M-Pesa / bank reference" className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-2 text-sm"/></label><label className="mt-2 block text-xs text-neutral-600">Notes<input value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-neutral-200 px-2 text-sm"/></label><button onClick={() => void recordPayment()} disabled={busy || !selectedBusinessId || !paymentReference.trim()} className="mt-3 w-full rounded-lg bg-orange-500 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Record verified payment & update access</button></div>
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <div className="rounded-xl border border-neutral-200 p-4">
        <h3 className="font-semibold text-neutral-950">Customer support inbox</h3>
        <div className="mt-3 max-h-72 space-y-2 overflow-auto">{tickets.length ? tickets.map((ticket) => <button key={ticket.id} onClick={() => void openTicket(ticket.id)} className={"block w-full rounded-lg border p-3 text-left " + (selectedTicketId === ticket.id ? "border-orange-300 bg-orange-50" : "border-neutral-100 hover:bg-neutral-50")}><div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold text-neutral-900">{ticket.subject || "Support request"}</span><span className="text-[10px] font-semibold uppercase text-neutral-500">{ticket.status}</span></div><p className="mt-1 text-xs text-neutral-500">{ticket.businesses?.name || "TWIGA customer"} · {ticket.contact || ticket.channel || "Portal"} · {date(ticket.created_at)}</p></button>) : <p className="text-sm text-neutral-500">No support tickets yet.</p>}</div>
      </div>
      <div className="rounded-xl border border-neutral-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-neutral-950">Support conversation</h3>{ticketDetail?.ticket && <select value={ticketDetail.ticket.status} onChange={(event) => void updateTicketStatus(event.target.value)} className="h-9 rounded-lg border border-neutral-200 bg-white px-2 text-xs"><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select>}</div>
        {ticketBusy && <p className="mt-3 text-xs text-neutral-500">Loading support conversation…</p>}
        {ticketDetail?.ticket && <><p className="mt-1 text-xs text-neutral-500">{ticketDetail.ticket.customerEmail || ticketDetail.ticket.contact || "Customer"} · {ticketDetail.ticket.businesses?.name || "TWIGA"}</p><div className="mt-3 max-h-52 space-y-2 overflow-auto rounded-lg bg-neutral-50 p-3">{(ticketDetail.messages || []).map((message: Row) => <div key={message.id} className="rounded-lg bg-white p-2"><p className="text-[10px] font-bold uppercase text-neutral-500">{message.sender_role}</p><p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{message.message}</p><p className="mt-1 text-[10px] text-neutral-400">{date(message.created_at)}</p></div>)}</div><textarea value={ticketReply} onChange={(event) => setTicketReply(event.target.value)} rows={3} placeholder="Reply to this customer…" className="mt-3 w-full rounded-lg border border-neutral-200 p-3 text-sm"/><button onClick={() => void replyToTicket()} disabled={ticketBusy || !ticketReply.trim()} className="mt-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Send support reply</button></>}
        {!ticketBusy && !ticketDetail?.ticket && <p className="mt-3 text-sm text-neutral-500">Choose a support ticket to view its messages and reply.</p>}
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <div className="rounded-xl border border-neutral-200 p-4"><h3 className="font-semibold text-neutral-950">Phone and provider health</h3><div className="mt-3 max-h-64 overflow-auto"><table className="w-full text-left text-xs"><thead><tr className="text-neutral-500"><th className="p-2">Business / line</th><th className="p-2">Inbound</th><th className="p-2">Outbound</th><th className="p-2">Provider</th></tr></thead><tbody>{phoneLines.map((line) => <tr key={line.id} className="border-t border-neutral-100"><td className="p-2"><p className="font-semibold text-neutral-800">{clients.find((client) => client.id === line.business_id)?.name || "Business"}</p><p className="text-neutral-500">{line.line_number}</p></td><td className="p-2">{line.inbound_status || (line.inbound_enabled ? "Enabled" : "Off")}</td><td className="p-2">{line.outbound_status || (line.outbound_enabled ? "Enabled" : "Off")}</td><td className="p-2">{line.provider || "—"}</td></tr>)}</tbody></table>{!phoneLines.length && <p className="p-2 text-sm text-neutral-500">No phone lines registered.</p>}</div></div>
      <div className="rounded-xl border border-neutral-200 p-4"><h3 className="font-semibold text-neutral-950">Recent calls & technical activity</h3><div className="mt-3 max-h-64 space-y-2 overflow-auto">{recentCalls.slice(0,25).map((call) => <div key={call.id} className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-2"><div className="min-w-0"><p className="text-xs font-semibold text-neutral-800">{clients.find((client) => client.id === call.business_id)?.name || "Business"} · {call.direction || "call"}</p><p className="text-[11px] text-neutral-500">{call.provider} · {date(call.created_at)}</p></div><span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold">{call.status || "unknown"}</span></div>)}{!recentCalls.length && <p className="text-sm text-neutral-500">No calls logged yet.</p>}</div><h4 className="mt-4 text-xs font-bold uppercase tracking-wide text-neutral-600">Latest admin audit events</h4><div className="mt-2 max-h-32 space-y-2 overflow-auto">{auditLogs.slice(0,15).map((log) => <p key={log.id} className="border-b border-neutral-100 pb-1 text-[11px] text-neutral-600"><strong>{log.action}</strong> · {log.resource_type} · {date(log.created_at)}</p>)}</div></div>
    </div>

    <div className="rounded-xl border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-neutral-950">Subscription payment requests</h3><span className="text-xs text-neutral-500">{subscriptionIntents.length} recent</span></div>
      <div className="mt-3 overflow-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-neutral-100 text-neutral-600"><tr><th className="p-2">Client</th><th className="p-2">Plan</th><th className="p-2">Amount</th><th className="p-2">Phone</th><th className="p-2">Status</th><th className="p-2">Transaction</th><th className="p-2">Action</th></tr></thead><tbody>{subscriptionIntents.slice(0,50).map((intent) => <tr key={intent.id} className="border-t border-neutral-100"><td className="p-2">{intent.businesses?.name || clients.find((client) => client.id === intent.business_id)?.name || "Business"}</td><td className="p-2">{intent.plan_code}</td><td className="p-2 font-semibold">{money(intent.amount)}</td><td className="p-2">{intent.phone}</td><td className="p-2"><span className="rounded-full bg-neutral-100 px-2 py-1">{intent.status}</span></td><td className="p-2">{intent.provider_transaction_id || "Awaiting provider"}</td><td className="p-2">{intent.status !== "paid" && <button onClick={() => void verifySubscriptionIntent(intent.business_id, intent.id)} disabled={busy} className="rounded-lg border border-neutral-200 px-2.5 py-1.5 font-semibold">Verify</button>}</td></tr>)}</tbody></table>{!subscriptionIntents.length && <p className="p-2 text-sm text-neutral-500">No subscription payment requests yet.</p>}</div>
    </div>

    <div className="rounded-xl border border-neutral-200 p-4"><h3 className="font-semibold text-neutral-950">Recent payment ledger</h3><div className="mt-3 overflow-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead className="bg-neutral-100 text-neutral-600"><tr><th className="p-2">Client</th><th className="p-2">Amount</th><th className="p-2">Method</th><th className="p-2">Reference</th><th className="p-2">Paid at</th></tr></thead><tbody>{payments.slice(0,30).map((payment) => <tr key={payment.id} className="border-t border-neutral-100"><td className="p-2">{payment.businesses?.name || clients.find((client) => client.id === payment.business_id)?.name || "Business"}</td><td className="p-2 font-semibold">{money(payment.amount)}</td><td className="p-2">{payment.method}</td><td className="p-2">{payment.provider_reference || "—"}</td><td className="p-2">{date(payment.paid_at)}</td></tr>)}</tbody></table>{!payments.length && <p className="p-2 text-sm text-neutral-500">No platform payments recorded.</p>}</div></div>
  </section>;
}
