import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Ticket = { id: string; subject: string; message: string; status: string; created_at: string; updated_at: string };
type SupportMessage = { id: string; sender_role: "customer" | "admin"; message: string; created_at: string };

export default function CustomerSupport({ businessId }: { businessId: string }) {
  const [open, setOpen] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState("");
  const [creating, setCreating] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const invoke = useCallback(async (body: Record<string, unknown>) => {
    if (!supabase) throw new Error("Support is temporarily unavailable. Please refresh and try again.");
    const { data, error: invokeError } = await supabase.functions.invoke("twiga-support-portal", { body });
    if (invokeError) throw new Error(invokeError.message);
    if (data?.error) throw new Error(String(data.error));
    return data;
  }, []);

  const loadTickets = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await invoke({ action: "list", businessId });
      setTickets(Array.isArray(data.tickets) ? data.tickets : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load support conversations.");
    } finally { setLoading(false); }
  }, [businessId, invoke]);

  const loadThread = useCallback(async (selected: Ticket) => {
    setLoading(true); setError("");
    try {
      const data = await invoke({ action: "thread", ticketId: selected.id });
      setTicket(data.ticket || selected);
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this conversation.");
    } finally { setLoading(false); }
  }, [invoke]);

  useEffect(() => { if (open) void loadTickets(); }, [open, loadTickets]);

  const createTicket = async () => {
    if (!subject.trim() || !draft.trim()) { setError("Add a subject and explain what you need help with."); return; }
    setCreating(true); setError("");
    try {
      const data = await invoke({ action: "create", businessId, subject, message: draft });
      setSubject(""); setDraft("");
      await loadTickets();
      if (data.ticket) await loadThread(data.ticket);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send your support request."); }
    finally { setCreating(false); }
  };

  const sendReply = async () => {
    if (!ticket || !reply.trim()) return;
    setSending(true); setError("");
    try {
      await invoke({ action: "reply", ticketId: ticket.id, message: reply });
      setReply("");
      await loadThread(ticket);
      await loadTickets();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send your reply."); }
    finally { setSending(false); }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label="Open TWIGA customer support"
        className="twiga-support-float fixed bottom-6 right-5 z-[60] inline-flex items-center gap-2 rounded-xl border border-orange-400/40 bg-neutral-950 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-orange-900/20 hover:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
      >
        <span aria-hidden="true" className="text-base">✦</span> Support
      </button>

      {open && (
        <section className="fixed bottom-24 right-5 z-[60] flex max-h-[min(640px,calc(100vh-8rem))] w-[min(420px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-neutral-900 shadow-2xl">
          <header className="flex items-center justify-between border-b border-neutral-200 bg-neutral-950 px-4 py-3 text-white">
            <div><p className="text-sm font-bold">TWIGA Support</p><p className="text-xs text-neutral-300">Message the support team</p></div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-sm text-white hover:bg-neutral-800">Close</button>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs font-medium text-red-800">{error}</p>}
            {ticket ? (
              <>
                <button type="button" onClick={() => { setTicket(null); setMessages([]); }} className="text-xs font-semibold text-orange-700">← All conversations</button>
                <div><p className="font-semibold text-neutral-900">{ticket.subject}</p><p className="mt-1 text-xs text-neutral-600">Ticket · {ticket.status.replace(/_/g, " ")}</p></div>
                <div className="space-y-2">
                  {messages.map(item => (
                    <div key={item.id} className={item.sender_role === "admin" ? "mr-7 rounded-xl bg-orange-50 p-3" : "ml-7 rounded-xl bg-neutral-100 p-3"}>
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-700">{item.sender_role === "admin" ? "TWIGA Support" : "You"}</p>
                      <p className="whitespace-pre-wrap text-sm leading-5 text-neutral-900">{item.message}</p>
                      <p className="mt-1 text-[10px] text-neutral-600">{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                  {!messages.length && <p className="text-sm text-neutral-700">{ticket.message}</p>}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between"><p className="text-sm font-semibold text-neutral-900">Your conversations</p><button type="button" onClick={() => setCreating(value => !value)} className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white">{creating ? "Cancel" : "New message"}</button></div>
                {creating && <div className="space-y-2 rounded-xl border border-neutral-200 p-3">
                  <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" maxLength={120} className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500" />
                  <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="How can we help?" rows={3} maxLength={3000} className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500" />
                  <button type="button" disabled={sending} onClick={() => void createTicket()} className="w-full rounded-lg bg-neutral-950 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Send to support</button>
                </div>}
                {loading && <p className="text-xs text-neutral-600">Loading…</p>}
                {!loading && tickets.length === 0 && <p className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">No support conversations yet. Send us a message and we’ll help.</p>}
                {tickets.map(item => (
                  <button key={item.id} type="button" onClick={() => void loadThread(item)} className="block w-full rounded-xl border border-neutral-200 p-3 text-left hover:border-orange-300 hover:bg-orange-50">
                    <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-semibold text-neutral-900">{item.subject}</span><span className="rounded-full bg-neutral-100 px-2 py-1 text-[10px] font-semibold text-neutral-700">{item.status.replace(/_/g, " ")}</span></div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-700">{item.message}</p>
                    <p className="mt-1 text-[10px] text-neutral-600">{new Date(item.updated_at || item.created_at).toLocaleString()}</p>
                  </button>
                ))}
              </>
            )}
          </div>
          {ticket && <footer className="flex gap-2 border-t border-neutral-200 p-3">
            <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2} maxLength={5000} placeholder="Write a reply…" className="min-w-0 flex-1 resize-none rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-500" />
            <button type="button" disabled={sending || !reply.trim()} onClick={() => void sendReply()} className="self-end rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{sending ? "Sending…" : "Send"}</button>
          </footer>}
        </section>
      )}
    </>
  );
}
