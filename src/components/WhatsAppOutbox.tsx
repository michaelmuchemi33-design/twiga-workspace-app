import { useEffect, useRef, useState } from "react";
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


declare global {
  interface Window {
    FB?: {
      init: (options: {appId:string; cookie:boolean; xfbml:boolean; version:string}) => void;
      login: (callback:(response:any)=>void, options:Record<string,unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

type WhatsAppChannel = {
  configured: boolean;
  appId: string;
  configId: string;
  graphVersion: string;
  connected: boolean;
  phoneNumber: string;
  verifiedName: string;
  webhookUrl: string;
  lastWebhookAt?: string | null;
  tokenExpiresAt?: string | null;
};

export default function WhatsAppOutbox() {
  const { messages, addMessage, businessId, demoMode } = useStore();
  const [to, setTo] = useState("");
  const [phone, setPhone] = useState("");
  const [templateParams, setTemplateParams] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [whatsappChannel, setWhatsappChannel] = useState<WhatsAppChannel | null>(null);
  const [channelLoading, setChannelLoading] = useState(true);
  const [facebookReady, setFacebookReady] = useState(false);
  const [connectingWhatsApp, setConnectingWhatsApp] = useState(false);
  const [channelMessage, setChannelMessage] = useState("");
  const signupRef = useRef({code:"",wabaId:"",phoneNumberId:"",busy:false});



  const refreshWhatsAppChannel = async () => {
    if (!supabase || !businessId || demoMode) {
      setChannelLoading(false);
      return;
    }
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token || "";
      const response = await fetch("https://twiga-api.twiga-ke.workers.dev/whatsapp/config?business_id=" + encodeURIComponent(businessId), {
        headers: {"Authorization":"Bearer " + token, "x-business-id":businessId}
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || "WhatsApp status could not be loaded.");
      setWhatsappChannel(data as WhatsAppChannel);
    } catch (error) {
      setChannelMessage(error instanceof Error ? error.message : "WhatsApp status could not be loaded.");
    } finally {
      setChannelLoading(false);
    }
  };

  const completeEmbeddedSignup = async () => {
    const pending = signupRef.current;
    if (!pending.code || !pending.wabaId || !pending.phoneNumberId || pending.busy) return;
    pending.busy = true;
    setConnectingWhatsApp(true);
    setChannelMessage("Securing your WhatsApp Business connection…");
    try {
      if (!supabase || !businessId) throw new Error("Sign in to this business workspace first.");
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token || "";
      const response = await fetch("https://twiga-api.twiga-ke.workers.dev/whatsapp/connect", {
        method: "POST",
        headers: {"Content-Type":"application/json","Authorization":"Bearer " + token},
        body: JSON.stringify({
          business_id:businessId,
          token:token,
          code:pending.code,
          waba_id:pending.wabaId,
          phone_number_id:pending.phoneNumberId
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) throw new Error(data.error || "WhatsApp Business could not be connected.");
      setChannelMessage(data.message || "WhatsApp Business connected.");
      await refreshWhatsAppChannel();
    } catch (error) {
      setChannelMessage(error instanceof Error ? error.message : "WhatsApp connection failed.");
    } finally {
      signupRef.current = {code:"",wabaId:"",phoneNumberId:"",busy:false};
      setConnectingWhatsApp(false);
    }
  };

  useEffect(() => {
    void refreshWhatsAppChannel();
  }, [businessId, demoMode]);


  useEffect(() => {
    if (!whatsappChannel || !whatsappChannel.configured || !whatsappChannel.appId || demoMode) return;
    const init = () => {
      if (!window.FB) return;
      window.FB.init({
        appId:whatsappChannel.appId,
        cookie:true,
        xfbml:false,
        version:whatsappChannel.graphVersion || "v27.0"
      });
      setFacebookReady(true);
    };
    if (window.FB) {
      init();
      return;
    }
    window.fbAsyncInit = init;
    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      document.body.appendChild(script);
    }
  }, [whatsappChannel?.configured, whatsappChannel?.appId, whatsappChannel?.graphVersion, demoMode]);

  useEffect(() => {
    const receiveSignupMessage = (event: MessageEvent) => {
      let originHost = "";
      try { originHost = new URL(event.origin).hostname.toLowerCase(); } catch { return; }
      if (originHost !== "facebook.com" && !originHost.endsWith(".facebook.com")) return;
      let payload: any = event.data;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
      }
      if (!payload || payload.type !== "WA_EMBEDDED_SIGNUP") return;
      const data = payload.data || payload;
      const eventType = String(payload.event || data.event || "").toUpperCase();
      if (eventType === "CANCEL") {
        setChannelMessage("WhatsApp setup was cancelled. No changes were made.");
        return;
      }
      if (eventType === "ERROR") {
        setChannelMessage(String(data.error_message || "Meta could not complete the WhatsApp signup. No number was connected."));
        return;
      }
      const wabaId = String(data.waba_id || data.wabaId || data.whatsapp_business_account_id || "");
      const phoneNumberId = String(data.phone_number_id || data.phoneNumberId || "");
      if (eventType === "FINISH" && wabaId && phoneNumberId) {
        signupRef.current.wabaId = wabaId;
        signupRef.current.phoneNumberId = phoneNumberId;
        void completeEmbeddedSignup();
      }
    };
    window.addEventListener("message", receiveSignupMessage);
    return () => window.removeEventListener("message", receiveSignupMessage);
  }, [businessId]);

  const connectWhatsAppWithMeta = () => {
    if (demoMode) {
      setChannelMessage("Demo mode cannot connect a real WhatsApp account.");
      return;
    }
    if (!whatsappChannel?.configured || !whatsappChannel.configId || !window.FB || !facebookReady) {
      setChannelMessage("TWIGA admin must finish the Meta app and Embedded Signup v4 configuration first.");
      return;
    }
    setChannelMessage("Opening Meta to connect your WhatsApp Business account…");
    window.FB.login((response:any) => {
      const code = String(response?.authResponse?.code || response?.code || "");
      if (!code) {
        setChannelMessage("Meta did not return a connection code. Check that this Meta app uses Embedded Signup v4 with response type Code.");
        return;
      }
      signupRef.current.code = code;
      void completeEmbeddedSignup();
      setChannelMessage("Meta approved access. Finishing the secure number connection…");
    }, {
      config_id:whatsappChannel.configId,
      response_type:"code",
      override_default_response_type:true,
      extras:{}
    });
  };

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
    <div className="space-y-5">
      <Card className="rounded-2xl border-neutral-200 bg-white shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardDescription>Link the number used by this business. Connect the business’s official WhatsApp Business number directly through Meta. Chat33 WhatsApp support is not available yet.</CardDescription>
          </div>
          <Badge className={cn("border-0",wahaChannel?.connected?"bg-orange-50 text-orange-800":"bg-neutral-100 text-neutral-700")}>
            {wahaLoading?"Checking…":wahaChannel?.connected?"Connected":wahaChannel?.configured?(wahaChannel.status||"Not linked"):"Admin setup needed"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {wahaChannel?.connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-100 bg-orange-50/60 p-3">
              <div><p className="text-sm font-semibold text-neutral-950">{wahaChannel.pushName||"WhatsApp"} · {wahaChannel.phoneNumber||"Linked number"}</p><p className="mt-1 text-xs text-neutral-600">This WhatsApp account is linked to this business workspace.</p></div>
              <Button variant="outline" onClick={()=>void disconnectWaha()} disabled={wahaBusy} className="border-neutral-300 bg-white text-neutral-900">Disconnect</Button>
            </div>
          ) : !wahaChannel?.configured ? (
            <div className="rounded-xl bg-neutral-50 p-3">
              <p className="text-sm text-neutral-800">The QR and phone-number connection is ready in TWIGA, but the WAHA server has not been configured by the platform administrator.</p>
              <p className="mt-2 text-xs leading-5 text-neutral-500">Admin adds WAHA_BASE_URL and WAHA_API_KEY as private Cloudflare Worker secrets. The service must have persistent session storage enabled.</p>
            </div>
          ) : (
            <>
              <p className="text-sm leading-5 text-neutral-600">Scan using WhatsApp on the phone that owns this number. You can also request a temporary linking code if QR scanning is inconvenient.</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={()=>void startWahaConnection()} disabled={wahaBusy||wahaLoading||demoMode} className="bg-neutral-950 text-white hover:bg-neutral-800">{wahaBusy?"Starting…":"Start QR connection"}</Button>
                <Button variant="outline" onClick={()=>void refreshWahaChannel()} disabled={wahaBusy} className="border-neutral-300 bg-white text-neutral-900">Check status</Button>
              </div>
              {wahaQr && !wahaChannel?.connected && (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:flex-row sm:items-start">
                  <img src={wahaQr} alt="WhatsApp link device QR code" className="h-52 w-52 rounded-lg border border-neutral-100 bg-white object-contain" />
                  <div className="flex-1 space-y-2 text-sm text-neutral-700">
                    <p className="font-semibold text-neutral-950">Scan with your phone</p>
                    <ol className="list-decimal space-y-1 pl-4 text-sm leading-5">
                      <li>Open WhatsApp on your phone.</li><li>Open Linked devices.</li><li>Choose Link a device, then scan this code.</li>
                    </ol>
                    <p className="text-xs text-neutral-500">QR codes expire quickly. Refresh the code if it stops working.</p>
                    <Button size="sm" variant="outline" onClick={()=>void refreshWahaQr()} disabled={wahaBusy} className="border-neutral-300 bg-white text-neutral-900">Refresh QR code</Button>
                  </div>
                </div>
              )}
              <div className="grid gap-2 rounded-xl border border-neutral-200 p-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1.5"><Label>Phone number with country code</Label><Input value={wahaPhone} onChange={(event)=>setWahaPhone(event.target.value)} placeholder="2547XXXXXXXX" inputMode="tel" /><p className="text-[11px] text-neutral-500">Use digits only, including 254 for Kenya.</p></div>
                <Button onClick={()=>void requestWahaPairingCode()} disabled={wahaBusy||wahaPhone.replace(/\D/g,"").length<10} className="bg-neutral-950 text-white hover:bg-neutral-800">Get linking code</Button>
              </div>
              {wahaPairingCode && <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-center"><p className="text-xs font-semibold uppercase tracking-wide text-orange-800">Your WhatsApp linking code</p><p className="mt-1 text-2xl font-bold tracking-[.2em] text-neutral-950">{wahaPairingCode}</p><p className="mt-2 text-xs leading-5 text-neutral-600">On your phone: WhatsApp → Linked devices → Link with phone number, then enter this code.</p></div>}
            </>
          )}
          {wahaMessage && <p role="status" className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{wahaMessage}</p>}
          <p className="text-[11px] leading-5 text-neutral-500">WAHA is an unofficial WhatsApp Web integration, not the official Meta Cloud API. Use a business-owned number, follow WhatsApp rules, and understand the possibility of account restrictions. The official Meta connection below is the recommended production option.</p>
        </CardContent>
      </Card>
      <Card className="rounded-2xl border-neutral-200 bg-white shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <IconChat className="h-5 w-5 text-orange-500" /> WhatsApp Business · Direct Meta connection
            </CardTitle>
            <CardDescription>This is a separate official Meta connection, not part of the Chat33 social gateway.</CardDescription>
          </div>
          <Badge className={cn("border-0",whatsappChannel?.connected ? "bg-orange-50 text-orange-800" : "bg-neutral-100 text-neutral-700")}>
            {channelLoading ? "Checking…" : whatsappChannel?.connected ? "Connected" : "Not connected"}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {whatsappChannel?.connected ? (
            <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-3">
              <p className="text-sm font-semibold text-neutral-950">{whatsappChannel.verifiedName || "WhatsApp Business"} · {whatsappChannel.phoneNumber}</p>
              <p className="mt-1 text-xs text-neutral-600">{whatsappChannel.lastWebhookAt ? "Meta has delivered a webhook to TWIGA." : "Waiting for the first webhook from Meta."}</p>
            </div>
          ) : (
            <p className="text-sm leading-5 text-neutral-600">
              Once connected, TWIGA can answer incoming text messages and voice notes, and notify your team when a person asks for help.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={connectWhatsAppWithMeta} disabled={channelLoading || connectingWhatsApp || demoMode || !whatsappChannel?.configured || !facebookReady} className="bg-neutral-950 text-white hover:bg-neutral-800">
              {connectingWhatsApp ? "Connecting…" : whatsappChannel?.connected ? "Connect another number" : "Connect with Meta"}
            </Button>
            {whatsappChannel?.webhookUrl && <Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(whatsappChannel.webhookUrl); setChannelMessage("Webhook URL copied. Add it in Meta Developer settings and subscribe to WhatsApp messages and calls."); }}>Copy webhook URL</Button>}
          </div>
          {!whatsappChannel?.configured && !demoMode && <p className="text-xs leading-5 text-neutral-500">Meta setup is not complete yet. TWIGA admin must add the Meta App ID, Embedded Signup v4 configuration, webhook verification token, app secret and encrypted-token key.</p>}
          {whatsappChannel?.configured && !whatsappChannel.connected && <p className="text-xs leading-5 text-neutral-500">After connecting, add the callback URL in Meta Developer settings and subscribe this app to WhatsApp message and call webhooks.</p>}
          {whatsappChannel?.connected && !whatsappChannel.lastWebhookAt && <p className="text-xs leading-5 text-neutral-500">The number is connected. Incoming replies start after the Meta webhook is verified and the WhatsApp webhook field is subscribed.</p>}
          {channelMessage && <p role="status" className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{channelMessage}</p>}
          <p className="text-[11px] leading-5 text-neutral-500">TWIGA uses Meta’s official Cloud API. Free-form replies are limited to the customer service window; approved templates are needed outside it. Automated replies must support human handover.</p>
        </CardContent>
      </Card>

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
    </div>
  );
}
