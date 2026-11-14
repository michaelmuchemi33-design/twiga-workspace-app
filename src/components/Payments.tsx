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

export default function Payments() {
  const { businessId } = useStore();
  const [tab, setTab] = useState<Tab>("collect");
  const [connected, setConnected] = useState(false);
  const [keyLast4, setKeyLast4] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [balance, setBalance] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
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
      setBalance(data.balance || null);
      if (data.keyConfigured) await loadTransactions();
      else setTransactions([]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load PalPluss settings.");
    }
  }, [businessId, invoke, loadTransactions]);

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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "PalPluss key could not be saved.");
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
      <div><p className="text-xs font-semibold uppercase tracking-widest text-orange-500">Collections · M-Pesa</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-950">Payments</h1><p className="mt-1 text-sm text-neutral-500">Real PalPluss STK Push requests and confirmed transaction records.</p></div>
      <div className="flex gap-3"><div className="rounded-xl bg-neutral-950 px-4 py-3 text-white"><p className="text-[10px] uppercase tracking-widest text-neutral-400">Collected</p><p className="mt-1 text-xl font-bold">KES {collected.toLocaleString()}</p></div><div className="rounded-xl bg-neutral-950 px-4 py-3 text-white"><p className="text-[10px] uppercase tracking-widest text-neutral-400">Pending</p><p className="mt-1 text-xl font-bold">KES {pending.toLocaleString()}</p></div></div>
    </header>

    <div className="flex rounded-xl border border-neutral-200 bg-white p-1 shadow-sm"><button onClick={() => setTab("collect")} className={"rounded-lg px-4 py-2 text-sm font-medium " + (tab === "collect" ? "bg-neutral-950 text-white" : "text-neutral-500")}>Collect</button><button onClick={() => setTab("keys")} className={"rounded-lg px-4 py-2 text-sm font-medium " + (tab === "keys" ? "bg-neutral-950 text-white" : "text-neutral-500")}>API & connection</button></div>

    {tab === "collect" ? <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">New M-Pesa STK Push</h2><p className="mt-1 text-sm text-neutral-500">The customer receives a payment prompt on their phone.</p>
        {!connected && <div className="mt-4 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">Connect your PalPluss API key in the API & connection tab first.</div>}
        <div className="mt-4 space-y-3">
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
        <h2 className="text-lg font-semibold">PalPluss API key</h2><p className="mt-1 text-sm text-neutral-400">Paste the API key from the PalPluss dashboard. TWIGA validates it and stores it encrypted per business.</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input type="password" autoComplete="off" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="pp_live_…" className="h-11 min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-3 font-mono text-sm text-white placeholder:text-neutral-500" /><button onClick={saveKey} disabled={busy || keyDraft.trim().length < 20} className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? "Checking…" : "Validate & save"}</button></div>
        <p className="mt-3 text-xs leading-5 text-neutral-400">The API uses HTTP Basic authentication with the API key as username and an empty password. TWIGA creates the Base64 header server-side; you do not need to paste the separate Base64 token.</p>
      </section>
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-neutral-950">Connection</h2><div className="mt-4 flex justify-between border-b pb-3 text-sm"><span className="text-neutral-500">Status</span><strong>{connected ? "Connected" : "Not connected"}</strong></div><div className="mt-3 flex justify-between border-b pb-3 text-sm"><span className="text-neutral-500">Key</span><strong>{connected ? "•••• " + keyLast4 : "Not saved"}</strong></div><div className="mt-3 flex justify-between text-sm"><span className="text-neutral-500">Service wallet</span><strong>{balance?.availableBalance != null ? "KES " + Number(balance.availableBalance).toLocaleString() : "Not checked"}</strong></div><button onClick={refresh} disabled={busy || !connected} className="mt-4 w-full rounded-xl border px-4 py-2.5 text-sm font-semibold disabled:opacity-40">Refresh connection</button></section>
    </div>}

    {message && <p className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{message}</p>}
  </div>;
}
