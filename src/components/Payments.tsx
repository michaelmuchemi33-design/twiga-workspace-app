import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";

type Transaction = {
  id: string;
  transaction_id: string;
  customer_name?: string;
  status: string;
  amount: number;
  currency: string;
  phone?: string;
  account_reference?: string;
  transaction_desc?: string;
  mpesa_receipt?: string;
  created_at: string;
};

type Tab = "collect" | "keys";
type Channel = { id: string; provider_channel_id: string; name: string; type: "PAYBILL" | "TILL_NUMBER" | "SEND_MONEY"; shortcode: string; account_number?: string | null; is_default: boolean };
type PendingOrder = { id: string; order_number: string; customer_name: string; customer_phone: string | null; total_amount: number; description: string; status: string; payment_status: string; customer_sms_consent?: boolean; created_at: string };

export default function Payments() {
  const { businessId } = useStore();
  const [tab, setTab] = useState<Tab>("collect");
  const [connected, setConnected] = useState(false);
  const [keyLast4, setKeyLast4] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [paylinkId, setPaylinkId] = useState("");
  const [balance, setBalance] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelName, setChannelName] = useState("");
  const [channelType, setChannelType] = useState<"PAYBILL" | "TILL_NUMBER">("PAYBILL");
  const [shortcode, setShortcode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [makeDefault, setMakeDefault] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const invoke = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!supabase || !businessId) throw new Error("Create or select a business workspace first.");
    const { data, error } = await supabase.functions.invoke("twiga-palpluss", { body: { action, businessId, ...extra } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(String(data.error));
    return data;
  }, [businessId]);

  const loadChannels = useCallback(async () => {
    if (!businessId) { setChannels([]); setSelectedChannelId(""); return; }
    const data = await invoke("channel.list");
    const rows = Array.isArray(data.channels) ? data.channels as Channel[] : [];
    setChannels(rows);
    setSelectedChannelId((current) => current && rows.some((x) => x.provider_channel_id === current) ? current : (rows.find((x) => x.is_default)?.provider_channel_id || rows[0]?.provider_channel_id || ""));
  }, [businessId, invoke]);

  const loadPendingOrders = useCallback(async () => {
    if (!supabase || !businessId) { setPendingOrders([]); return; }
    const { data, error } = await supabase.from("twiga_orders").select("id,order_number,customer_name,customer_phone,total_amount,description,status,payment_status,customer_sms_consent,created_at").eq("business_id", businessId).eq("status", "pending_confirmation").eq("payment_status", "unpaid").order("created_at", { ascending: false }).limit(20);
    if (error) throw error;
    setPendingOrders((data || []) as PendingOrder[]);
  }, [businessId]);

  useEffect(() => {
    if (!businessId || !supabase) return;
    void loadPendingOrders();
    const channel = supabase.channel("twiga-payment-orders-" + businessId).on("postgres_changes", { event: "*", schema: "public", table: "twiga_orders", filter: "business_id=eq." + businessId }, () => {
      void loadPendingOrders();
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [businessId, loadPendingOrders]);

  const loadTransactions = useCallback(async () => {
    if (!supabase || !businessId) { setTransactions([]); return; }
    const { data, error } = await supabase.from("twiga_palpluss_transactions").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(30);
    if (error) throw error;
    setTransactions((data || []) as Transaction[]);
  }, [businessId]);

  const refresh = useCallback(async () => {
    if (!businessId) return;
    try {
      const data = await invoke("get_config");
      setConnected(data.keyConfigured === true);
      setKeyLast4(data.keyLast4 || "");
      setPaylinkId(String(data.paylinkId || ""));
      setBalance(data.balance || null);
      if (data.keyConfigured) { await loadTransactions(); await loadChannels(); }
      else { setTransactions([]); setChannels([]); }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load PalPluss settings.");
    }
  }, [businessId, invoke, loadTransactions, loadChannels]);

  useEffect(() => { void refresh(); }, [refresh]);

  const saveKey = async () => {
    setBusy(true);
    setMessage("");
    try {
      const data = await invoke("save_key", { apiKey: keyDraft.trim() });
      setKeyDraft("");
      setConnected(true);
      setKeyLast4(data.keyLast4 || "");
      setBalance(data.balance || null);
      setMessage(data.message || "PalPluss key securely connected.");
      await loadTransactions();
      await loadChannels();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PalPluss key could not be saved.");
    } finally { setBusy(false); }
  };

  const savePaylinkId = async () => {
    const value = paylinkId.trim();
    if (!value) { setMessage("Paste the public PalPluss Paylink ID from your PalPluss console."); return; }
    setBusy(true); setMessage("Saving the business Paylink ID…");
    try {
      const data = await invoke("save_paylink", { paylinkId: value });
      setPaylinkId(String(data.paylinkId || value));
      setMessage(data.message || "Public PalPluss Paylink ID saved for this business.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this business Paylink ID.");
    } finally { setBusy(false); }
  };

  const payOrderWithPaylink = async (order: PendingOrder) => {
    if (!paylinkId.trim()) { setMessage("Add this business's PalPluss Paylink ID in API & connection first."); setTab("keys"); return; }
    const widget = (window as any).Palpluss;
    if (!widget?.pay) { setMessage("PalPluss checkout did not load. Refresh the dashboard and try again."); return; }
    if (!order.customer_phone || Number(order.total_amount) < 1) { setMessage("This order needs a customer phone and valid amount before checkout."); return; }
    if (!window.confirm("Open PalPluss hosted checkout for " + order.customer_name + " for KES " + Number(order.total_amount).toLocaleString() + "? The M-Pesa prompt will go to " + order.customer_phone + ".")) return;
    setBusy(true); setMessage("Opening PalPluss hosted M-Pesa checkout…");
    try {
      const paid = await widget.pay(paylinkId.trim(), {
        amount: Number(order.total_amount),
        phone: order.customer_phone,
        customerName: order.customer_name,
        lockPrefill: true,
      });
      const transactionId = String(paid?.txId || paid?.transactionId || paid?.tx_id || "").trim();
      if (!transactionId) throw new Error("PalPluss checkout returned no transaction ID. The order has not been marked paid.");
      const verification = await invoke("order.verify_paylink_payment", { orderId: order.id, transactionId });
      if (!verification.verified) throw new Error(verification.message || "PalPluss has not confirmed this order as paid yet.");
      let smsNote = "";
      if (order.customer_sms_consent) {
        try {
          const { data, error } = await supabase!.functions.invoke("twiga-kimisms", { body: { action: "send_payment_confirmation", businessId, orderId: order.id } });
          if (error) throw new Error(error.message);
          if (data?.error) throw new Error(String(data.error));
          smsNote = " Payment receipt SMS: " + (data?.duplicate ? "already submitted" : "submitted") + ".";
        } catch (smsError) {
          smsNote = " Payment is confirmed; the separate SMS receipt could not be sent: " + (smsError instanceof Error ? smsError.message : "SMS failed.");
        }
      } else {
        smsNote = " No receipt SMS was sent because this customer has not opted in to SMS.";
      }
      setMessage("PalPluss verified KES " + Number(verification.amount || order.total_amount).toLocaleString() + " for order " + order.order_number + ". TWIGA marked it as paid." + smsNote);
      await loadPendingOrders();
      await loadTransactions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PalPluss checkout did not complete.");
    } finally { setBusy(false); }
  };

  const createStk = async () => {
    if (!customer.trim() || !phone.trim() || Number(amount) < 1) return;
    if (!window.confirm("Send an M-Pesa STK prompt to " + phone + " for KES " + Number(amount).toLocaleString() + "?")) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await invoke("stk", {
        phone: phone.trim(),
        amount: Number(amount),
        accountReference: (note.trim() || "TWIGA-" + Date.now()).slice(0, 120),
        transactionDesc: (note.trim() || ("Payment from " + customer.trim())).slice(0, 255),
        channelId: selectedChannelId || undefined,
      });
      setMessage("M-Pesa prompt initiated. It is not a confirmed payment until PalPluss reports SUCCESS. Transaction ID: " + (result.transaction?.transactionId || "created"));
      setCustomer("");
      setPhone("");
      setAmount("");
      setNote("");
      await loadTransactions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start the STK prompt.");
    } finally { setBusy(false); }
  };

  const createChannel = async () => {
    if (!channelName.trim() || !shortcode.trim()) return;
    if (channelType === "PAYBILL" && !accountNumber.trim()) { setMessage("Add the Paybill account number."); return; }
    setBusy(true);
    setMessage("");
    try {
      const result = await invoke("channel.create", { name: channelName.trim(), type: channelType, shortcode: shortcode.trim(), accountNumber: accountNumber.trim(), isDefault: makeDefault });
      const created = result.channel as Channel;
      setChannels((current) => [created, ...current.filter((x) => x.provider_channel_id !== created.provider_channel_id)]);
      setSelectedChannelId(created.provider_channel_id);
      setChannelName(""); setShortcode(""); setAccountNumber("");
      setMessage("Business payment channel saved. Future STK prompts can route to this Till or Paybill.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add this payment channel.");
    } finally { setBusy(false); }
  };

  const requestOrderPayment = async (order: PendingOrder) => {
    if (!order.customer_phone || Number(order.total_amount) < 1) { setMessage("This call order needs a customer phone number and a confirmed amount before requesting payment."); return; }
    if (!selectedChannelId) { setMessage("Add or select this business's Till or Paybill first."); return; }
    const phone = order.customer_phone;
    if (!window.confirm("Send an M-Pesa payment prompt for KES " + Number(order.total_amount).toLocaleString() + " to " + phone + " from this business's selected Till / Paybill?")) return;
    setBusy(true);
    setMessage("Starting payment request for " + order.order_number + "…");
    try {
      const result = await invoke("stk", { phone, amount: Number(order.total_amount), channelId: selectedChannelId, accountReference: order.order_number || ("TWIGA-" + order.id.slice(0, 8)), transactionDesc: ("Order " + order.order_number + " · " + order.customer_name).slice(0, 255) });
      const { error } = await supabase!.from("twiga_orders").update({ status: "payment_requested", payment_status: "pending", payment_method: "MPESA_STK" }).eq("business_id", businessId).eq("id", order.id);
      if (error) throw error;
      let smsNote = "";
      if (order.customer_sms_consent) {
        try {
          const { data: sms, error: smsError } = await supabase!.functions.invoke("twiga-kimisms", { body: { action: "send_payment_request_notice", businessId, orderId: order.id } });
          if (smsError) throw new Error(smsError.message);
          if (sms?.error) throw new Error(String(sms.error));
          smsNote = " Order payment notice SMS: " + (sms.duplicate ? "already sent" : "submitted") + ".";
        } catch (smsError) {
          smsNote = " The M-Pesa prompt was sent; the optional SMS notice could not be sent: " + (smsError instanceof Error ? smsError.message : "SMS failed.");
        }
      } else {
        smsNote = " No SMS was sent because customer SMS consent has not been recorded.";
      }
      setMessage("M-Pesa prompt sent to " + phone + ". It is pending until PalPluss confirms SUCCESS. Transaction: " + (result.transaction?.transactionId || "created") + "." + smsNote);
      await loadPendingOrders();
      await loadTransactions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not request payment for this order.");
    } finally { setBusy(false); }
  };

  const sendOrderConfirmationSms = async (order: PendingOrder) => {
    if (!order.customer_phone) { setMessage("This order has no customer phone number."); return; }
    if (!order.customer_sms_consent && !window.confirm("Confirm that this customer explicitly agreed to receive order updates by SMS on " + order.customer_phone + "? Continue only if the customer gave permission.")) return;
    setBusy(true); setMessage("Preparing order confirmation SMS…");
    try {
      if (!order.customer_sms_consent) {
        const { data: consent, error: consentError } = await supabase!.functions.invoke("twiga-kimisms", { body: { action: "record_order_consent", businessId, orderId: order.id, customerConfirmed: true } });
        if (consentError) throw new Error(consentError.message);
        if (consent?.error) throw new Error(String(consent.error));
      }
      const { data, error } = await supabase!.functions.invoke("twiga-kimisms", { body: { action: "send_order_confirmation", businessId, orderId: order.id, ownerConfirmed: true } });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      setMessage((data.message || "Order SMS accepted by KIMISMS.") + (data.paymentLinkIncluded ? " Secure PalPluss payment link included." : ""));
      await loadPendingOrders();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Order confirmation SMS could not be sent.");
    } finally { setBusy(false); }
  };

  const checkPending = async () => {
    setBusy(true);
    setMessage("Checking pending transactions…");
    try {
      const pending = transactions.filter((t) => ["PENDING", "PROCESSING"].includes(String(t.status).toUpperCase())).slice(0, 10);
      for (const tx of pending) await invoke("transaction.get", { transactionId: tx.transaction_id });
      await loadTransactions();
      setMessage("Transaction statuses refreshed from PalPluss.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not refresh transactions.");
    } finally { setBusy(false); }
  };

  const collected = transactions.filter((t) => String(t.status).toUpperCase() === "SUCCESS").reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const pending = transactions.filter((t) => ["PENDING", "PROCESSING"].includes(String(t.status).toUpperCase())).reduce((sum, t) => sum + Number(t.amount || 0), 0);

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-orange-500">Collections · M-Pesa</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-950">Payments</h1><p className="mt-1 text-sm text-neutral-500">PalPluss verifies M-Pesa payments. After an owner confirms an order, TWIGA sends its secure checkout link by opted-in KIMISMS SMS.</p></div>
      <div className="flex gap-3"><div className="rounded-xl bg-neutral-950 px-4 py-3 text-white"><p className="text-[10px] uppercase tracking-widest text-neutral-400">Collected</p><p className="mt-1 text-xl font-bold">KES {collected.toLocaleString()}</p></div><div className="rounded-xl bg-neutral-950 px-4 py-3 text-white"><p className="text-[10px] uppercase tracking-widest text-neutral-400">Pending</p><p className="mt-1 text-xl font-bold">KES {pending.toLocaleString()}</p></div></div>
    </header>

    {pendingOrders.length > 0 && <section className="rounded-2xl border border-orange-200 bg-orange-50/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-orange-700">Completed AI calls</p><h2 className="mt-1 text-lg font-semibold text-neutral-950">Orders awaiting payment request</h2><p className="mt-1 text-sm text-neutral-600">These orders were captured after the receptionist finished a call. Review the amount and customer, then confirm the order to send a secure PalPluss checkout link by opted-in SMS.</p></div><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-neutral-700">{pendingOrders.length} awaiting review</span></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">{pendingOrders.map((order) => <div key={order.id} className="rounded-xl border border-neutral-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-neutral-950">{order.customer_name || "Customer"}</p><p className="mt-1 text-xs text-neutral-500">{order.customer_phone || "No phone captured"} · {order.order_number}</p></div><strong className="whitespace-nowrap text-sm text-neutral-950">KES {Number(order.total_amount).toLocaleString()}</strong></div><p className="mt-2 line-clamp-2 text-xs text-neutral-600">{order.description || "Order captured during AI receptionist call."}</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><button onClick={() => void sendOrderConfirmationSms(order)} disabled={busy || !order.customer_phone} className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-40">{order.customer_sms_consent ? "Confirm order & send paylink" : "Confirm SMS consent & send paylink"}</button><button onClick={() => void requestOrderPayment(order)} disabled={!connected || !selectedChannelId || busy || !order.customer_phone || Number(order.total_amount) < 1} className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-40">{busy ? "Working…" : "Send M-Pesa STK"}</button><button onClick={() => void payOrderWithPaylink(order)} disabled={!connected || !paylinkId.trim() || busy || !order.customer_phone || Number(order.total_amount) < 1} className="rounded-xl bg-orange-500 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Working…" : "Hosted Paylink checkout"}</button></div></div>)}</div>
    </section>}

    <div className="flex rounded-xl border border-neutral-200 bg-white p-1 shadow-sm"><button onClick={() => setTab("collect")} className={"rounded-lg px-4 py-2 text-sm font-medium " + (tab === "collect" ? "bg-neutral-950 text-white" : "text-neutral-500")}>Collect</button><button onClick={() => setTab("keys")} className={"rounded-lg px-4 py-2 text-sm font-medium " + (tab === "keys" ? "bg-neutral-950 text-white" : "text-neutral-500")}>API & connection</button></div>

    {tab === "collect" ? <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-neutral-950">Business collection accounts</h2><p className="mt-1 text-sm text-neutral-500">Register this business's own Safaricom Till or Paybill with PalPluss. Each business keeps its own shortcode and account reference.</p></div><span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold">{channels.length} saved</span></div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <input value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder="Account label e.g. Main Till" className="h-11 rounded-xl border border-neutral-200 px-3 text-sm md:col-span-2" />
          <select value={channelType} onChange={(e) => setChannelType(e.target.value as "PAYBILL" | "TILL_NUMBER")} className="h-11 rounded-xl border border-neutral-200 bg-white px-3 text-sm"><option value="PAYBILL">Paybill</option><option value="TILL_NUMBER">Buy Goods / Till</option></select>
          <input value={shortcode} onChange={(e) => setShortcode(e.target.value)} placeholder="Paybill / Till number" className="h-11 rounded-xl border border-neutral-200 px-3 text-sm" />
          <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} disabled={channelType !== "PAYBILL"} placeholder={channelType === "PAYBILL" ? "Account number" : "Not needed for Till"} className="h-11 rounded-xl border border-neutral-200 px-3 text-sm disabled:bg-neutral-50" />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-sm text-neutral-600"><input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} /> Make this the default collection account</label><button onClick={createChannel} disabled={!connected || busy || !channelName.trim() || !shortcode.trim() || (channelType === "PAYBILL" && !accountNumber.trim())} className="rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Saving…" : "Add business account"}</button></div>
        {channels.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2">{channels.map((x) => <div key={x.provider_channel_id} className="rounded-xl border border-neutral-100 bg-neutral-50 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm">{x.name}</strong>{x.is_default && <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold">Default</span>}</div><p className="mt-1 text-xs text-neutral-500">{x.type === "TILL_NUMBER" ? "Buy Goods / Till" : "Paybill"} · {x.shortcode}{x.account_number ? " · Account " + x.account_number : ""}</p></div>)}</div>}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">New M-Pesa STK Push</h2><p className="mt-1 text-sm text-neutral-500">The customer receives a payment prompt on their phone.</p>
        {!connected && <div className="mt-4 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">Ask the TWIGA administrator to connect the central PalPluss account in Profile, or add a business-specific key in API & connection.</div>}
        <div className="mt-4 space-y-3">
          {channels.length > 0 && <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">Collect into business Till / Paybill<select value={selectedChannelId} onChange={(e) => setSelectedChannelId(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3 text-sm font-normal normal-case">{channels.map((x) => <option key={x.provider_channel_id} value={x.provider_channel_id}>{x.name} · {x.type === "TILL_NUMBER" ? "Till" : "Paybill"} {x.shortcode}{x.is_default ? " · Default" : ""}</option>)}</select></label>}
          {channels.length === 0 && connected && <p className="rounded-xl bg-orange-50 p-3 text-xs text-orange-900">Add this business's Till or Paybill below before sending a routed payment request.</p>}
          <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">Customer name<input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Grace Mwangi" className="mt-1 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm font-normal normal-case" /></label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">M-Pesa phone<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" className="mt-1 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm font-normal normal-case" /></label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">Amount (KES)<input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="1" step="1" placeholder="1500" className="mt-1 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm font-normal normal-case" /></label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">Reference / description<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Invoice or order reference" className="mt-1 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm font-normal normal-case" /></label>
          <button onClick={createStk} disabled={!connected || busy || !customer.trim() || !phone.trim() || Number(amount) < 1} className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Working…" : "Send M-Pesa prompt"}</button>
          <p className="text-[11px] leading-5 text-neutral-400">A prompt is sent only after you press the button and confirm. Do not mark a transaction paid manually; TWIGA records the status returned by PalPluss.</p>
        </div>
      </section>
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-neutral-950">Payment transactions</h2><p className="mt-1 text-sm text-neutral-500">PalPluss is the source of truth for payment status.</p></div><button onClick={checkPending} disabled={!connected || busy} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Refresh pending</button></div>
        <div className="mt-4 space-y-3">
          {transactions.length === 0 && <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm text-neutral-500">No PalPluss transactions yet.</div>}
          {transactions.map((tx) => {
            const status = String(tx.status || "PENDING").toUpperCase();
            const success = status === "SUCCESS";
            const pendingStatus = status === "PENDING" || status === "PROCESSING";
            return <div key={tx.transaction_id} className="flex flex-col gap-3 rounded-xl border border-neutral-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="text-sm font-semibold text-neutral-950">{tx.customer_name || tx.account_reference || tx.transaction_desc || "M-Pesa payment"}</p><p className="mt-1 text-xs text-neutral-500">{tx.phone || "Phone not returned"} · {new Date(tx.created_at).toLocaleString()}</p><p className="mt-1 truncate font-mono text-[10px] text-neutral-400">{tx.transaction_id}</p>{tx.mpesa_receipt && <p className="mt-1 text-xs font-semibold text-neutral-700">M-Pesa receipt: {tx.mpesa_receipt}</p>}</div>
              <div className="flex items-center gap-3"><strong className="text-sm text-neutral-950">KES {Number(tx.amount).toLocaleString()}</strong><span className={"rounded-full px-3 py-1 text-xs font-semibold " + (success ? "bg-neutral-900 text-white" : pendingStatus ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-600")}>{status}</span></div>
            </div>;
          })}
        </div>
      </section>
    </div> : <div className="grid gap-6 lg:grid-cols-3">
      <section className="rounded-2xl border border-neutral-200 bg-neutral-950 p-5 text-white shadow-lg lg:col-span-2">
        <h2 className="text-lg font-semibold text-white">This business’s PalPluss API key</h2><p className="mt-1 text-sm text-neutral-300">Connect the PalPluss account that belongs to this business. The key is stored privately for this workspace and used only by TWIGA’s server.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="pk_live_…" className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-3 font-mono text-sm text-white placeholder:text-neutral-500" /><button onClick={saveKey} disabled={busy || keyDraft.trim().length < 20} className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Checking…" : "Validate & save"}</button></div>
        <p className="mt-3 text-xs leading-5 text-neutral-400">PalPluss uses one API key for server-to-server requests. TWIGA stores it in encrypted Vault and creates the Basic Authorization header server-side. Do not paste the key into the public Paylink field.</p>
      </section>
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-neutral-950">Hosted M-Pesa Paylink</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-600">Create a Paylink in your PalPluss console, then paste its public ID here. TWIGA uses that ID to open PalPluss's hosted checkout and prefill each order's amount and phone. No extra secret key is needed for the browser widget.</p>
        <label className="mt-3 block text-sm font-medium text-neutral-800">Public Paylink ID<input value={paylinkId} onChange={e => setPaylinkId(e.target.value)} maxLength={120} placeholder="Paste PalPluss Paylink ID" className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2.5 font-mono text-sm" /></label>
        <button onClick={savePaylinkId} disabled={busy || !paylinkId.trim()} className="mt-3 w-full rounded-xl bg-neutral-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Save business Paylink ID</button>
        <p className="mt-2 text-xs text-neutral-500">{!connected ? "Connect the private PalPluss API key as well; TWIGA needs it to verify every Paylink transaction before marking an order paid." : paylinkId ? "Paylink ID saved or ready to save. Hosted checkout is available for orders once the ID is saved." : "No Paylink ID configured. Hosted checkout buttons remain disabled."}</p>
      </section>
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-neutral-950">Connection</h2><div className="mt-4 flex justify-between border-b pb-3 text-sm"><span className="text-neutral-500">Status</span><strong>{connected ? "Connected" : "Not connected"}</strong></div><div className="mt-3 flex justify-between border-b pb-3 text-sm"><span className="text-neutral-500">Key</span><strong>{connected ? "•••• " + keyLast4 : "Not saved"}</strong></div><div className="mt-3 flex justify-between text-sm"><span className="text-neutral-500">Service wallet</span><strong>{balance?.availableBalance != null ? "KES " + Number(balance.availableBalance).toLocaleString() : "Not checked"}</strong></div><button onClick={refresh} disabled={busy || !connected} className="mt-4 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Refresh connection</button></section>
    </div>}

    {message && <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{message}</p>}
  </div>;
}
