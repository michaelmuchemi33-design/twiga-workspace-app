import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type CheckoutData = {
  businessName: string;
  orderNumber: string;
  customerName: string;
  phone: string;
  amount: number;
  currency: string;
  paylinkId: string;
  expiresAt: string;
  paid: boolean;
};

export default function PublicPaylink() {
  const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") || "" : "";
  const [data, setData] = useState<CheckoutData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token || !supabase) {
        setMessage("This payment link is invalid or expired.");
        setLoading(false);
        return;
      }
      const { data: result, error } = await supabase.functions.invoke("twiga-public-paylink", { body: { action: "load", token } });
      if (cancelled) return;
      if (error || result?.error) {
        setMessage(result?.error || error?.message || "Could not load this payment request.");
      } else {
        setData(result as CheckoutData);
        setPaid(result?.paid === true);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [token]);

  const pay = async () => {
    if (!data || !supabase || busy || paid) return;
    setBusy(true);
    setMessage("Opening secure PalPluss checkout…");
    try {
      let widget = (window as any).Palpluss;
      for (let attempt = 0; attempt < 20 && !widget?.pay; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        widget = (window as any).Palpluss;
      }
      if (!widget?.pay) throw new Error("PalPluss checkout did not load. Refresh this page and try again.");
      const result = await widget.pay(data.paylinkId, {
        amount: Number(data.amount),
        phone: data.phone,
        customerName: data.customerName,
        accountReference: data.orderNumber,
        transactionDesc: "TWIGA order " + data.orderNumber,
        lockPrefill: true,
      });
      const transactionId = String(result?.transactionId || result?.transaction_id || result?.transaction?.transactionId || result?.id || "");
      if (!transactionId) throw new Error("PalPluss returned no transaction ID. The order has not been marked paid.");
      const { data: verification, error } = await supabase.functions.invoke("twiga-public-paylink", {
        body: { action: "verify", token, transactionId },
      });
      if (error || verification?.error) throw new Error(verification?.error || error?.message || "Could not verify this payment.");
      if (verification?.verified) {
        setPaid(true);
        setMessage("Payment confirmed. " + data.businessName + " has received your payment for order " + data.orderNumber + ".");
      } else {
        setMessage(verification?.message || "Payment submitted. Waiting for PalPluss confirmation…");
        for (let attempt = 0; attempt < 8; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const { data: status } = await supabase.functions.invoke("twiga-public-paylink", { body: { action: "status", token } });
          if (status?.paid === true) {
            setPaid(true);
            setMessage("Payment confirmed. " + data.businessName + " has received your payment for order " + data.orderNumber + ".");
            break;
          }
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The payment could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  return <main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-950">
    <div className="mx-auto max-w-lg">
      <div className="mb-8 flex items-center gap-3"><img src="/twiga-mark.svg" alt="TWIGA" className="h-10 w-10" /><div><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Secure checkout</p><p className="text-lg font-bold">TWIGA</p></div></div>
      <section className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        {loading ? <p className="text-sm text-neutral-500">Loading your payment request…</p> : data ? <>
          <p className="text-sm text-neutral-500">Payment to</p>
          <h1 className="mt-1 text-2xl font-bold">{data.businessName}</h1>
          <p className="mt-2 text-sm text-neutral-500">Order {data.orderNumber}</p>
          <div className="my-6 rounded-2xl bg-neutral-950 p-5 text-white">
            <p className="text-xs uppercase tracking-widest text-neutral-400">Amount due</p>
            <p className="mt-2 text-3xl font-bold">KES {Number(data.amount).toLocaleString("en-KE")}</p>
            <p className="mt-2 text-xs text-neutral-400">Customer: {data.customerName} · {data.phone}</p>
          </div>
          {paid ? <p className="rounded-xl bg-neutral-100 p-4 text-sm font-semibold">Payment confirmed. Thank you.</p> : <button onClick={() => void pay()} disabled={busy} className="w-full rounded-xl bg-orange-500 px-5 py-4 text-sm font-bold text-white disabled:opacity-50">{busy ? "Processing…" : "Pay securely with M-Pesa"}</button>}
          <p className="mt-4 text-xs leading-5 text-neutral-500">Never share your M-Pesa PIN, OTP or security code. TWIGA marks an order paid only after PalPluss verifies the transaction amount and phone number.</p>
        </> : <div><h1 className="text-xl font-bold">Payment link unavailable</h1><p className="mt-2 text-sm text-neutral-600">{message}</p></div>}
        {message && data && <p className="mt-4 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{message}</p>}
      </section>
      <p className="mt-5 text-center text-xs text-neutral-400">Payments processed by PalPluss · Customer messages delivered by the business's SMS provider.</p>
    </div>
  </main>;
}