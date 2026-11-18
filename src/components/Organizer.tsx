import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  IconSwap, IconBulb, IconPlus, IconInbox, IconSend, IconTrash, IconSparkle,
  IconCheck, IconClock, IconAlert,
} from "@/components/Icons";

type Kind = "task" | "idea" | "followup";
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  kind: Kind;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  due_at: string | null;
  approval_required: boolean;
  approval_status: string;
  action_type: string | null;
  action_payload: Record<string, any> | null;
  source: string;
  created_at: string;
};

async function readFunctionError(error: any, fallback: string) {
  const response = error?.context;
  if (response && typeof response.clone === "function") {
    try {
      const payload = await response.clone().json();
      if (payload?.error) return String(payload.error);
      if (payload?.message) return String(payload.message);
    } catch {
      try { const raw = await response.clone().text(); if (raw.trim()) return raw.slice(0, 500); } catch { /* no response body */ }
    }
  }
  return error?.message || fallback;
}
const priorities = ["low", "normal", "high", "urgent"] as const;
const categories = ["operations", "sales", "customer_support", "bookings", "delivery", "stock", "finance", "compliance", "customer_follow_up", "growth"];
const label = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase());

export default function Organizer() {
  const { businessId } = useStore();
  const [items, setItems] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<Kind>("task");
  const [category, setCategory] = useState("operations");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [dueAt, setDueAt] = useState("");
  const [filter, setFilter] = useState<"all" | "tasks" | "ideas" | "approvals" | "done">("all");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!businessId || !supabase) { setItems([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("twiga_tasks")
      .select("id,title,description,status,kind,category,priority,due_at,approval_required,approval_status,action_type,action_payload,source,created_at")
      .eq("business_id", businessId).order("created_at", { ascending: false }).limit(200);
    if (error) setMessage(error.message);
    else setItems((data || []) as Task[]);
    setLoading(false);
  }, [businessId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!businessId || !supabase) return;
    const channel = supabase.channel("twiga-organizer-" + businessId)
      .on("postgres_changes", { event: "*", schema: "public", table: "twiga_tasks", filter: "business_id=eq." + businessId }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [businessId, load]);

  const add = async () => {
    if (!businessId || !supabase || title.trim().length < 3) return;
    setBusy(true); setMessage("");
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in again before adding a task.");
      const { data, error } = await supabase.from("twiga_tasks").insert({
        business_id: businessId,
        created_by: auth.user.id,
        title: title.trim(),
        description: description.trim() || null,
        status: "open",
        kind,
        category,
        priority,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        source: "manual",
        approval_required: false,
        approval_status: "not_required",
        action_payload: {},
        metadata: {},
        updated_at: new Date().toISOString(),
      }).select("id").single();
      if (error) throw error;
      setTitle(""); setDescription(""); setDueAt(""); setKind("task"); setPriority("normal");
      setMessage("Saved to this business workspace.");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save this task."); }
    finally { setBusy(false); }
  };

  const updateStatus = async (item: Task, status: string) => {
    if (!supabase || !businessId) return;
    setBusy(true); setMessage("");
    const { error } = await supabase.from("twiga_tasks").update({
      status,
      ...(status === "done" ? { completed_at: new Date().toISOString() } : { completed_at: null }),
      updated_at: new Date().toISOString(),
    }).eq("id", item.id).eq("business_id", businessId);
    if (error) setMessage(error.message); else await load();
    setBusy(false);
  };

  const remove = async (id: string) => {
    if (!supabase || !businessId) return;
    setBusy(true);
    const { error } = await supabase.from("twiga_tasks").delete().eq("id", id).eq("business_id", businessId);
    if (error) setMessage(error.message); else await load();
    setBusy(false);
  };

  const decideCallback = async (item: Task, decision: "approve_callback" | "reject_callback") => {
    if (!supabase || !businessId) return;
    setBusy(true); setMessage(decision === "approve_callback" ? "Approving and scheduling the consented callback…" : "Rejecting the proposed callback…");
    try {
      const { data, error } = await supabase.functions.invoke("twiga-ai-actions", {
        body: { action: decision, businessId, taskId: item.id },
      });
      if (error) throw new Error(await readFunctionError(error, "The AI action approval service returned an error."));
      if (data?.error) throw new Error(String(data.error));
      setMessage(data?.message || (decision === "approve_callback" ? "Callback approved." : "Callback rejected. No call was placed."));
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update this approval."); }
    finally { setBusy(false); }
  };

  const visible = useMemo(() => items.filter((item) => {
    if (filter === "tasks") return item.kind === "task" || item.kind === "followup";
    if (filter === "ideas") return item.kind === "idea";
    if (filter === "approvals") return item.approval_status === "pending";
    if (filter === "done") return item.status === "done";
    return true;
  }), [items, filter]);
  const pendingApprovals = items.filter((item) => item.approval_status === "pending").length;
  const openTasks = items.filter((item) => item.status !== "done" && item.status !== "cancelled").length;
  const ideas = items.filter((item) => item.kind === "idea").length;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-orange-600">TWIGA · business operations</p>
        <h1 className="mt-1 text-2xl font-bold text-neutral-950">Organize work</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-neutral-600">Real tasks, ideas and AI-proposed customer callbacks for the selected business. AI can log work automatically. Outbound callbacks wait for recipient consent and, by default, owner approval.</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Open work</p><p className="mt-1 text-xl font-bold tabular-nums text-neutral-950">{openTasks}</p></div>
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Needs approval</p><p className="mt-1 text-xl font-bold tabular-nums text-neutral-950">{pendingApprovals}</p></div>
          <div className="rounded-xl bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Ideas</p><p className="mt-1 text-xl font-bold tabular-nums text-neutral-950">{ideas}</p></div>
        </div>
      </header>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><IconSwap className="h-5 w-5 text-orange-500" /><h2 className="font-semibold text-neutral-950">Capture work</h2></div>
        <p className="mt-1 text-xs text-neutral-500">Add an internal task or idea. AI-created tasks will also appear here.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void add()} placeholder="What needs doing?" className="h-11 rounded-xl border border-neutral-200 px-3 text-sm outline-none focus:border-orange-400 sm:col-span-2" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Details, customer context or next steps…" rows={2} className="rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-orange-400 sm:col-span-2" />
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className="h-10 rounded-xl border border-neutral-200 px-3 text-sm"><option value="task">Task</option><option value="idea">Idea</option><option value="followup">Follow-up</option></select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-10 rounded-xl border border-neutral-200 px-3 text-sm">{categories.map((x) => <option key={x} value={x}>{label(x)}</option>)}</select>
          <select value={priority} onChange={(e) => setPriority(e.target.value as Task["priority"])} className="h-10 rounded-xl border border-neutral-200 px-3 text-sm">{priorities.map((x) => <option key={x} value={x}>{label(x)} priority</option>)}</select>
          <input aria-label="Due date and time" type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="h-10 rounded-xl border border-neutral-200 px-3 text-sm" />
        </div>
        <div className="mt-3 flex justify-end"><button onClick={() => void add()} disabled={!businessId || busy || title.trim().length < 3} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-40"><IconPlus className="h-4 w-4" /> Add to workspace</button></div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-semibold text-neutral-950">Business work queue</h2><p className="mt-1 text-xs text-neutral-500">Only records belonging to the currently selected business are shown.</p></div>
          <button onClick={() => void load()} disabled={loading || busy} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700">Refresh</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {(["all","tasks","ideas","approvals","done"] as const).map((value) => <button key={value} onClick={() => setFilter(value)} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", filter === value ? "border-orange-500 bg-orange-500 text-white" : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300")}>{value === "approvals" ? "Needs approval (" + pendingApprovals + ")" : label(value)}</button>)}
        </div>
        <div className="mt-4 space-y-3">
          {!businessId && <p className="rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">Select a business workspace to view its tasks.</p>}
          {businessId && loading && <p className="py-8 text-center text-sm text-neutral-500">Loading this business's work queue…</p>}
          {businessId && !loading && visible.length === 0 && <div className="rounded-xl border border-dashed border-neutral-200 p-8 text-center"><IconInbox className="mx-auto h-7 w-7 text-neutral-300" /><p className="mt-2 text-sm font-medium text-neutral-700">No records in this view</p><p className="mt-1 text-xs text-neutral-500">New work recorded by the AI or your team will appear here. No sample items are inserted.</p></div>}
          {visible.map((item) => {
            const pending = item.approval_status === "pending";
            const done = item.status === "done" || item.status === "cancelled";
            return <article key={item.id} className="rounded-xl border border-neutral-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-semibold text-neutral-950">{item.title}</span><span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">{label(item.kind)}</span><span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-600">{label(item.category || "operations")}</span></div>
                  {item.description && <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-neutral-600">{item.description}</p>}
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-neutral-500"><span className={cn("rounded-full px-2 py-1", item.priority === "urgent" ? "bg-red-50 text-red-700" : item.priority === "high" ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-600")}>{label(item.priority || "normal")} priority</span><span className="rounded-full bg-neutral-100 px-2 py-1">{label(item.status)}</span>{item.due_at && <span className="rounded-full bg-neutral-100 px-2 py-1">Due {new Date(item.due_at).toLocaleString()}</span>}{item.source === "ai_receptionist" && <span className="rounded-full bg-neutral-100 px-2 py-1">Created by AI</span>}</div>
                </div>
                <button onClick={() => void remove(item.id)} disabled={busy} aria-label="Delete task" className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-30"><IconTrash className="h-4 w-4" /></button>
              </div>
              {pending && item.action_type === "schedule_followup" && <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-orange-900"><IconAlert className="h-4 w-4" /> Customer callback requires approval</div>
                <p className="mt-1 text-xs leading-5 text-orange-900">The AI says the customer agreed to this callback. Review the destination, reason and time before approving. Approval adds it to the scheduled-call queue; it does not place an immediate call.</p>
                <div className="mt-2 text-xs text-orange-950">{item.action_payload?.phone} · {item.action_payload?.reason} · {item.action_payload?.scheduled_at ? new Date(item.action_payload.scheduled_at).toLocaleString() : "Time not supplied"}</div>
                <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void decideCallback(item,"approve_callback")} disabled={busy} className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Approve & schedule callback</button><button onClick={() => void decideCallback(item,"reject_callback")} disabled={busy} className="rounded-lg border border-orange-300 bg-white px-3 py-2 text-xs font-semibold text-orange-900 disabled:opacity-40">Reject</button></div>
              </div>}
              {!pending && !done && <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void updateStatus(item,"in_progress")} disabled={busy || item.status === "in_progress"} className="rounded-lg border border-neutral-200 px-3 py-2 text-xs font-semibold text-neutral-700 disabled:opacity-40">Start</button><button onClick={() => void updateStatus(item,"done")} disabled={busy} className="rounded-lg bg-neutral-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"><IconCheck className="mr-1 inline h-3.5 w-3.5" /> Mark done</button></div>}
            </article>;
          })}
        </div>
      </section>
      {message && <p role="status" className="rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-700">{message}</p>}
    </div>
  );
}
