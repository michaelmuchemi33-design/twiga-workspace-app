import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Subscription = {
  plan_code?: string; billing_interval?: string; currency?: string; amount?: number;
  status?: string; trial_started_at?: string; trial_ends_at?: string;
  current_period_start?: string; current_period_end?: string;
  grace_period_ends_at?: string; last_payment_at?: string;
};
type PaymentIntent = {
  id: string; plan_code: string; amount: number; phone: string; status: string;
  provider_transaction_id?: string | null; created_at: string; expires_at: string;
  verified_at?: string | null;
};
type BillingStatus = {
  subscription: Subscription | null; recentPayments: PaymentIntent[];
  paymentProviderConfigured: boolean; paymentProviderLast4?: string | null;
};
const plans = [
  { code: "starter", name: "Starter", price: 1650, description: "For a business getting started with an AI front desk." },
  { code: "professional", name: "Professional", price: 3000, description: "For a growing team with more involved customer workflows." },
  { code: "business_pro", name: "Business Pro", price: 5000, description: "For businesses with advanced call-handling needs." },
] as const;
const money = (n: unknown) => "KSh " + Number(n || 0).toLocaleString("en-KE");
const date = (v?: string | null) => v ? new Date(v).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : "—";
const stateLabel = (s?: string) => ({ trialing: "Free trial", trial: "Free trial", active: "Active", expired: "Expired", past_due: "Payment due", pending: "Awaiting payment", review_required: "Review needed", paid: "Paid" } as Record<string,string>)[String(s || "").toLowerCase()] || String(s || "Not set");

export default function SubscriptionBilling({ businessId, demo = false }: { businessId: string; demo?: boolean }) {
  const [data, setData] = useState<BillingStatus | null>(null);
  const [plan, setPlan] = useState<string>("starter");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastIntentId, setLastIntentId] = useState("");
  const selectedPlan = useMemo(() => plans.find(p => p.code === plan) || plans[0], [plan]);

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    if (!supabase) throw new Error("TWIGA is not connected. Refresh and sign in again.");
    const { data: result, error: invokeError } = await supabase.functions.invoke("twiga-subscription-billing", {
      body: { action, businessId, ...extra },
    });
    if (invokeError) throw new Error(invokeError.message);
    if (result?.error) throw new Error(String(result.error));
    return result || {};
  }, [businessId]);

  const load = useCallback(async () => {
    if (demo || !businessId) return;
    setError("");
    try { setData(await call("status") as BillingStatus); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load your subscription."); }
  }, [call, businessId, demo]);

  useEffect(() => { void load(); }, [load]);

  const startPayment = async () => {
    if (demo) { setNotice("Demo only: no real M-Pesa prompt has been sent."); return; }
    if (!businessId) { setError("Finish creating your business workspace first."); return; }
    if (!phone.trim()) { setError("Enter the Kenyan mobile number that should receive the M-Pesa prompt."); return; }
    const accepted = window.confirm("Request an M-Pesa STK prompt for " + money(selectedPlan.price) + " for " + selectedPlan.name + "? Your subscription will only activate after PalPluss confirms the payment.");
    if (!accepted) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await call("create_stk", { planCode: selectedPlan.code, phone: phone.trim() });
      setLastIntentId(String(result.intent?.id || ""));
      setNotice("M-Pesa prompt requested for " + money(selectedPlan.price) + ". Check your phone and enter your M-Pesa PIN only in the Safaricom prompt. TWIGA has not activated access until payment is verified.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not request the M-Pesa payment."); }
    finally { setBusy(false); }
  };

  const refreshPayment = async (intentId?: string) => {
    const target = intentId || lastIntentId || data?.recentPayments?.[0]?.id;
    if (!target) { await load(); return; }
    setRefreshBusy(true); setError(""); setNotice("");
    try {
      const result = await call("refresh", { intentId: target });
      setNotice(String(result.message || (result.paid ? "Payment verified and access activated." : "Payment is not confirmed yet.")));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not verify that payment yet."); }
    finally { setRefreshBusy(false); }
  };

  const sub = data?.subscription;
  const currentStatus = String(sub?.status || "not_set").toLowerCase();
  const trialEnd = sub?.trial_ends_at;
  return <section className="space-y-5">
    <header className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-orange-600">TWIGA subscription</p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold tracking-tight text-neutral-950">Plan & billing</h1><p className="mt-1 max-w-2xl text-sm leading-6 text-neutral-600">Your TWIGA subscription is separate from Payments, which is where your business collects money from its own customers.</p></div>
        <span className="rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700">{demo ? "Demo" : stateLabel(sub?.status)}</span>
      </div>
      {demo ? <p className="mt-4 rounded-xl bg-orange-50 p-3 text-sm leading-6 text-orange-950">This is sample billing information. No real payment prompts, subscriptions or customer records are changed in the demo.</p> :
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Current plan</p><p className="mt-1 text-lg font-bold text-neutral-950">{plans.find(p => p.code === sub?.plan_code)?.name || (sub?.plan_code || "Not selected")}</p></div>
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Subscription amount</p><p className="mt-1 text-lg font-bold text-neutral-950">{money(sub?.amount)}<span className="text-xs font-medium text-neutral-500"> / month</span></p></div>
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Current access through</p><p className="mt-1 text-lg font-bold text-neutral-950">{sub?.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("en-KE") : sub?.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString("en-KE") : "—"}</p></div>
        </div>}
      {!demo && currentStatus === "trialing" && trialEnd && <p className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm leading-6 text-orange-950">Your 7-day trial runs until <strong>{date(trialEnd)}</strong>. You can set up and test your workspace during the trial. To run real customer calls, your business phone line and call routing must also be verified.</p>}
      {!demo && data && !data.paymentProviderConfigured && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-950"><strong>M-Pesa checkout is not connected yet.</strong> TWIGA’s platform administrator must connect the central PalPluss account securely in Profile → Platform connections. No payment prompt can be sent until that is done.</p>}
      {!demo && <button onClick={() => void load()} className="mt-3 rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700">Refresh subscription status</button>}
    </header>

    <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">Choose your monthly plan</h2>
        <p className="mt-1 text-sm text-neutral-500">No recurring debit is assumed. Each M-Pesa STK request is a payment you approve on your phone.</p>
        <div className="mt-4 grid gap-3">
          {plans.map(p => <label key={p.code} className={"flex cursor-pointer items-start gap-3 rounded-xl border p-4 " + (plan === p.code ? "border-orange-400 bg-orange-50/70" : "border-neutral-200")}>
            <input type="radio" name="twiga-plan" value={p.code} checked={plan === p.code} onChange={() => setPlan(p.code)} className="mt-1 accent-orange-500" />
            <span className="min-w-0 flex-1"><span className="flex flex-wrap items-baseline justify-between gap-2"><strong className="text-sm text-neutral-950">{p.name}</strong><strong className="text-sm text-neutral-950">{money(p.price)} <span className="font-normal text-neutral-500">/ month</span></strong></span><span className="mt-1 block text-xs leading-5 text-neutral-500">{p.description}</span></span>
          </label>)}
        </div>
        <label className="mt-4 block text-xs font-semibold text-neutral-700">Kenyan M-Pesa phone number
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0712 345 678 or +254712345678" autoComplete="tel" className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm font-normal" />
        </label>
        <button onClick={() => void startPayment()} disabled={busy || demo || !data?.paymentProviderConfigured || !businessId} className="mt-4 w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-bold text-neutral-950 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Requesting M-Pesa prompt…" : "Pay " + money(selectedPlan.price) + " with M-Pesa"}</button>
        <p className="mt-3 text-[11px] leading-5 text-neutral-400">TWIGA checks the confirmed amount and currency with PalPluss before granting paid access. Do not send your M-Pesa PIN or OTP to TWIGA staff.</p>
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-950">What is included in activation?</h2>
        <ul className="mt-3 space-y-3 text-sm leading-6 text-neutral-600">
          <li><strong className="text-neutral-900">Business workspace:</strong> your products, customer records, setup documents and AI instructions remain in your business workspace.</li>
          <li><strong className="text-neutral-900">AI setup:</strong> review the AI’s answers and approved business information before exposing it to callers.</li>
          <li><strong className="text-neutral-900">Phone activation:</strong> each business needs a verified phone line, agent binding and call-routing test. Payment alone does not make calls live.</li>
          <li><strong className="text-neutral-900">Customer collections:</strong> use the separate Payments area to configure your business Till/Paybill and collect customer payments.</li>
        </ul>
        <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-xs leading-5 text-neutral-500">If phone rental, call usage or an optional provider charge applies to your setup, TWIGA should show it before the service is activated.</div>
      </div>
    </div>

    {!demo && data?.recentPayments?.length ? <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold text-neutral-950">Recent subscription payment requests</h2><button onClick={() => void refreshPayment()} disabled={refreshBusy} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold">{refreshBusy ? "Checking…" : "Check latest payment"}</button></div>
      <div className="mt-3 divide-y divide-neutral-100">{data.recentPayments.map(intent => <div key={intent.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-neutral-900">{plans.find(p => p.code === intent.plan_code)?.name || intent.plan_code} · {money(intent.amount)}</p><p className="mt-1 text-xs text-neutral-500">{intent.phone} · {date(intent.created_at)}</p><p className="mt-1 text-xs text-neutral-500">Reference: {intent.provider_transaction_id || "Awaiting provider response"}</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-700">{stateLabel(intent.status)}</span>{intent.status !== "paid" && <button onClick={() => void refreshPayment(intent.id)} disabled={refreshBusy} className="rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold">Verify</button>}</div></div>)}</div>
    </div> : null}

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm leading-6 text-orange-950">{notice}</p>}
  </section>;
}
