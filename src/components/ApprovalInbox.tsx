import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Approval = {
  id: string;
  title: string;
  description: string | null;
  action_type: string | null;
  action_payload: Record<string, any> | null;
  approval_status: string;
  created_at: string;
};

export default function ApprovalInbox({ businessId, demo = false }: { businessId: string; demo?: boolean }) {
  const [items, setItems] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (demo) {
      setItems([{
        id: "demo-approval",
        title: "Review a requested customer callback",
        description: "A customer asked the business to call back about a quote. Review the number and agreed time before scheduling.",
        action_type: "schedule_followup",
        action_payload: { customer_name: "Brian Otieno", phone: "+254712345602", reason: "Customer requested a quote follow-up", scheduled_at: new Date(Date.now() + 45 * 60_000).toISOString(), recipient_consent_confirmed: true },
        approval_status: "pending",
        created_at: new Date().toISOString(),
      }]);
      setLoading(false);
      return;
    }
    if (!businessId || !supabase) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("twiga_tasks")
      .select("id,title,description,action_type,action_payload,approval_status,created_at")
      .eq("business_id", businessId)
      .eq("approval_required", true)
      .eq("approval_status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) setMessage(error.message);
    else setItems((data || []) as Approval[]);
    setLoading(false);
  }, [businessId, demo]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (demo || !businessId || !supabase) return;
    const channel = supabase.channel("twiga-ai-approval-inbox-" + businessId)
      .on("postgres_changes", { event: "*", schema: "public", table: "twiga_tasks", filter: "business_id=eq." + businessId }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [businessId, demo, load]);

  const decide = async (item: Approval, decision: "approve_callback" | "reject_proposal") => {
    if (demo) {
      setItems((current) => current.filter((x) => x.id !== item.id));
      setMessage(decision === "approve_callback"
        ? "Demo approval recorded locally. No real call was scheduled."
        : "Demo request rejected locally. No call was placed.");
      return;
    }
    if (!supabase || !businessId) return;
    setBusyId(item.id);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("twiga-ai-actions", {
        body: { action: decision, businessId, taskId: item.id },
      });
      if (error) {
        const response = (error as any)?.context;
        const payload = response && typeof response.clone === "function" ? await response.clone().json().catch(() => null) : null;
        throw new Error(payload?.error || error.message || "Approval could not be updated.");
      }
      if (data?.error) throw new Error(String(data.error));
      setMessage(String(data?.message || (decision === "approve_callback" ? "Callback approved and queued." : "Proposal rejected.")));
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Approval could not be updated.");
    } finally {
      setBusyId("");
    }
  };

  const count = items.length;
  return (
    <section className="overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100 bg-orange-50/70 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500 text-white" aria-hidden="true">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
          </span>
          <div>
            <h2 className="font-semibold text-neutral-950">Waiting for your approval</h2>
            <p className="text-xs text-neutral-600">Review AI-proposed actions before TWIGA proceeds.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-bold text-orange-800">{count} pending</span>
          <button type="button" onClick={() => void load()} disabled={loading || !!busyId} className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 hover:border-orange-300 disabled:opacity-40">Refresh</button>
        </div>
      </div>
      <div className="space-y-3 p-4 sm:p-5">
        {!businessId && !demo && <p className="rounded-xl border border-dashed border-neutral-200 p-5 text-center text-sm text-neutral-500">Select or create a business workspace to see its approvals.</p>}
        {loading && <p className="py-5 text-center text-sm text-neutral-500">Checking pending approvals…</p>}
        {!loading && businessId && count === 0 && <div className="rounded-xl border border-dashed border-neutral-200 p-5 text-center"><p className="text-sm font-semibold text-neutral-700">Nothing waiting right now</p><p className="mt-1 text-xs text-neutral-500">When the AI requests permission for an action, its exact details will appear here.</p></div>}
        {!loading && items.map((item) => {
          const callback = item.action_type === "schedule_followup";
          const payload = item.action_payload || {};
          const amount = payload.amount ?? payload.total_amount;
          const currency = payload.currency || "KES";
          return (
            <article key={item.id} className="rounded-xl border border-neutral-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-neutral-950">{item.title}</h3>
                    <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-800">Pending</span>
                  </div>
                  {item.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-neutral-600">{item.description}</p>}
                  <div className="mt-3 grid gap-2 text-xs text-neutral-600 sm:grid-cols-2">
                    {payload.provider && <p><span className="font-semibold text-neutral-800">Provider:</span> {String(payload.provider)}</p>}
                    {payload.recipient && <p><span className="font-semibold text-neutral-800">Recipient:</span> {String(payload.recipient)}</p>}
                    {payload.customer_name && <p><span className="font-semibold text-neutral-800">Customer:</span> {String(payload.customer_name)}</p>}
                    {payload.phone && <p><span className="font-semibold text-neutral-800">Phone:</span> {String(payload.phone)}</p>}
                    {amount !== undefined && <p><span className="font-semibold text-neutral-800">Amount:</span> {currency} {Number(amount).toLocaleString()}</p>}
                    {payload.billing_interval && <p><span className="font-semibold text-neutral-800">Billing:</span> Every {String(payload.billing_interval)}</p>}
                    {payload.scheduled_at && <p><span className="font-semibold text-neutral-800">Scheduled:</span> {new Date(payload.scheduled_at).toLocaleString()}</p>}
                    {payload.expires_at && <p><span className="font-semibold text-neutral-800">Expires:</span> {new Date(payload.expires_at).toLocaleString()}</p>}
                  </div>
                </div>
              </div>
              {callback ? (
                <div className="mt-4 rounded-xl bg-neutral-50 p-3">
                  <p className="text-xs leading-5 text-neutral-600">Confirm that the customer explicitly agreed to this number, reason and time. Approval schedules the callback; it does not place an immediate call.</p>
                  {payload.recipient_consent_confirmed !== true && <p className="mt-2 text-xs font-semibold text-red-700">Consent is not confirmed. Approval is blocked.</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void decide(item, "approve_callback")} disabled={!!busyId || payload.recipient_consent_confirmed !== true} className="rounded-lg bg-orange-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-40">{busyId === item.id ? "Working…" : "Approve & schedule"}</button>
                    <button type="button" onClick={() => void decide(item, "reject_proposal")} disabled={!!busyId} className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 hover:border-neutral-300 disabled:opacity-40">Reject</button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-xl bg-neutral-50 p-3">
                  <p className="text-xs leading-5 text-neutral-600">This proposal is waiting for a verified provider execution route. TWIGA will not spend money or charge a customer until the provider, exact amount, recipient, terms and expiry are verified.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" disabled className="rounded-lg bg-neutral-300 px-4 py-2.5 text-xs font-bold text-neutral-600" title="Provider execution is not connected yet">Approve & execute · connection required</button>
                    <button type="button" onClick={() => void decide(item, "reject_proposal")} disabled={!!busyId} className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 hover:border-neutral-300 disabled:opacity-40">Reject proposal</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
        {message && <p role="status" className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">{message}</p>}
      </div>
    </section>
  );
}
