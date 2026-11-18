import { useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useStore, uid, stamp } from "@/lib/store";
import { IconChat, IconSend, IconCheck, IconClock } from "@/components/Icons";

export default function WhatsAppOutbox() {
  const { messages, addMessage, businessId, demoMode } = useStore();
  const [to, setTo] = useState("");
  const [phone, setPhone] = useState("");
  const [templateParams, setTemplateParams] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const send = async () => {
    if (!to.trim() || !phone.trim() || !consentConfirmed) return;
    if (demoMode) {
      setMessage("Demo mode does not send real WhatsApp messages.");
      return;
    }
    if (!supabase || !businessId) {
      setMessage("Choose a signed-in business workspace first.");
      return;
    }
    const confirmed = window.confirm("Send this approved AiSensy template campaign to " + to.trim() + " (" + phone.trim() + ")? Only continue if the recipient explicitly opted in to receive this WhatsApp message.");
    if (!confirmed) return;
    setBusy(true); setMessage("Submitting the approved template campaign to AiSensy…");
    try {
      const params = templateParams.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke("twiga-aisensy", {
        body: {
          action: "send_template",
          businessId,
          to: phone.trim(),
          userName: to.trim(),
          templateParams: params,
          recipientConsentConfirmed: true,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(String(data.error));
      if (data?.sent !== true) throw new Error(data?.message || "AiSensy did not confirm the campaign submission.");
      const summary = "AiSensy template campaign · " + (params.length ? params.join(" | ") : "No template parameters");
      addMessage({
        id: String(data.messageId || uid()),
        to: to.trim(),
        phone: phone.trim(),
        body: summary,
        status: "sent",
        time: stamp(),
      });
      setMessage("AiSensy accepted the campaign request. Delivery is still pending; check the AiSensy campaign report for Delivered or Read.");
      setTo(""); setPhone(""); setTemplateParams(""); setConsentConfirmed(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "WhatsApp campaign request failed.");
    } finally { setBusy(false); }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="rounded-2xl border-neutral-200 shadow-sm lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold"><IconChat className="h-5 w-5 text-orange-500" /> WhatsApp Outbox</CardTitle>
            <CardDescription>AiSensy campaign submissions for this business</CardDescription>
          </div>
          <Badge className="border-neutral-900 bg-neutral-950 text-white">{messages.length} messages</Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.length === 0 && <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm text-neutral-500">No messages yet.</div>}
          {messages.map((m) => (
            <div key={m.id} className="rounded-xl border border-neutral-100 bg-white p-4 transition-colors hover:border-neutral-200 hover:bg-neutral-50">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-neutral-900">{m.to}</p>
                <span className="flex items-center gap-1 text-xs text-neutral-500">
                  {m.status === "delivered" ? <><IconCheck className="h-3.5 w-3.5 text-orange-500" /> Delivered</> :
                   m.status === "sent" ? <><IconClock className="h-3.5 w-3.5 text-orange-500" /> Submitted · delivery pending</> :
                   <><IconClock className="h-3.5 w-3.5" /> Queued</>}
                  · {m.time}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{m.phone}</p>
              <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">{m.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="sticky top-6 h-fit rounded-2xl border-neutral-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold"><IconSend className="h-5 w-5 text-orange-500" /> AiSensy template send</CardTitle>
          <CardDescription>Send a pre-approved API campaign template for this business</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Customer name</Label><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Customer name" /></div>
          <div className="space-y-2"><Label>WhatsApp phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2547XXXXXXXX" /></div>
          <div className="space-y-2"><Label>Template values</Label><Textarea value={templateParams} onChange={(e) => setTemplateParams(e.target.value)} placeholder={"One template parameter per line, in the order expected by the approved AiSensy template.\nExample:\nGrace\nOrder #104\nTomorrow at 10 AM"} rows={5} /><p className="text-[11px] leading-5 text-neutral-500">The approved template and API campaign are selected in Connections & permissions. This box supplies only its placeholder values, not a free-form WhatsApp message.</p></div>
          <label className="flex items-start gap-2 rounded-xl border border-neutral-200 p-3 text-xs leading-5 text-neutral-700"><input type="checkbox" checked={consentConfirmed} onChange={(e) => setConsentConfirmed(e.target.checked)} className="mt-0.5 accent-orange-500" /><span>I confirm this recipient explicitly agreed to receive this WhatsApp message from this business.</span></label>
          <Button onClick={() => void send()} disabled={busy || !to.trim() || !phone.trim() || !consentConfirmed || demoMode} className={cn("w-full bg-orange-500 text-white hover:bg-orange-600", (!to.trim() || !phone.trim() || !consentConfirmed || demoMode) && "opacity-60")}>
            <IconSend className="mr-2 h-4 w-4" /> {busy ? "Submitting…" : "Send approved template"}
          </Button>
          {demoMode && <p className="text-xs text-neutral-500">Real sending is disabled in demo mode.</p>}
          {message && <p role="status" className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{message}</p>}
          <p className="text-[11px] leading-5 text-neutral-500">AiSensy API acceptance means submitted, not delivered. Check AiSensy for the final delivery/read status. Do not use marketing lists or cold contacts without valid consent.</p>
        </CardContent>
      </Card>
    </div>
  );
}
