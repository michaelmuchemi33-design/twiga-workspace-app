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
  const [wahaStatus, setWahaStatus] = useState<any>({status:"NOT_CONNECTED",connected:false,ready:false});
  const [wahaBusy, setWahaBusy] = useState(false);
  const [wahaError, setWahaError] = useState("");
  const [wahaNotice, setWahaNotice] = useState("");
  const [wahaQr, setWahaQr] = useState("");
  const [wahaPairPhone, setWahaPairPhone] = useState("");
  const [wahaPairCode, setWahaPairCode] = useState("");
  const [wahaMode, setWahaMode] = useState<"qr"|"code">("qr");
  const signupRef = useRef({code:"",wabaId:"",phoneNumberId:"",busy:false});



  const wahaAuth = async () => {
    if (!supabase) throw new Error("TWIGA is not connected.");
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token || "";
    if (!token) throw new Error("Sign in again to connect WhatsApp.");
    return token;
  };

  const refreshWahaStatus = async () => {
    if (!supabase || !businessId || demoMode) { setWahaStatus({status:"DEMO",connected:false,ready:false}); return; }
    try {
      const token = await wahaAuth();
      const response = await fetch("https://twiga-api.twiga-ke.workers.dev/waha/status?business_id="+encodeURIComponent(businessId),{
        headers:{"Authorization":"Bearer "+token,"x-business-id":businessId}
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok || data.ok===false) throw new Error(data.error || "WhatsApp connection status could not be checked.");
      setWahaStatus(data);
      if (data.status==="WORKING") { setWahaQr(""); setWahaPairCode(""); }
      return data;
    } catch (error) {
      setWahaError(error instanceof Error ? error.message : "WhatsApp status could not be checked.");
      return null;
    }
  };

  const connectWaha = async () => {
    if (demoMode) { setWahaError("The sample workspace cannot link a real WhatsApp number."); return; }
    setWahaBusy(true); setWahaError(""); setWahaNotice(""); setWahaQr(""); setWahaPairCode("");
    try {
      const token = await wahaAuth();
      const response = await fetch("https://twiga-api.twiga-ke.workers.dev/waha/connect",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
        body:JSON.stringify({business_id:businessId,token})
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok || data.ok===false) {
        if (data.code==="ADMIN_SETUP_REQUIRED") throw new Error("WhatsApp storage is not assigned yet. Ask the TWIGA administrator to connect this business's WAHA storage first.");
        throw new Error(data.error || "WAHA could not start this WhatsApp connection.");
      }
      setWahaStatus(data);
      setWahaNotice("WhatsApp session started. Scan the QR code with your phone, or choose phone pairing.");
      await loadWahaQr(token);
      await refreshWahaStatus();
    } catch (error) {
      setWahaError(error instanceof Error ? error.message : "WhatsApp could not be connected.");
    } finally { setWahaBusy(false); }
  };

  const loadWahaQr = async (existingToken?: string) => {
    try {
      const token = existingToken || await wahaAuth();
      const response = await fetch("https://twiga-api.twiga-ke.workers.dev/waha/qr?business_id="+encodeURIComponent(businessId),{
        headers:{"Authorization":"Bearer "+token,"x-business-id":businessId}
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok || data.ok===false) throw new Error(data.error || "The QR code is not ready yet. Wait a moment and refresh.");
      setWahaQr(String(data.qrDataUrl||""));
    } catch (error) {
      setWahaError(error instanceof Error ? error.message : "QR code could not be loaded.");
    }
  };

  const requestWahaPairingCode = async () => {
    const normalized = wahaPairPhone.replace(/[^0-9]/g,"");
    if (!/^\\d{10,15}$/.test(normalized)) {
      setWahaError("Enter the WhatsApp number with country code, for example 254712345678.");
      return;
    }
    setWahaBusy(true); setWahaError(""); setWahaPairCode("");
    try {
      const token = await wahaAuth();
      const response = await fetch("https://twiga-api.twiga-ke.workers.dev/waha/pairing-code",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
        body:JSON.stringify({business_id:businessId,token,phone_number:normalized})
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok || data.ok===false) throw new Error(data.error || "WhatsApp pairing code could not be created. Try QR scanning.");
      setWahaPairCode(String(data.code||""));
      setWahaNotice(data.message || "Enter the pairing code on your phone in Linked devices.");
    } catch (error) {
      setWahaError(error instanceof Error ? error.message : "Pairing code could not be created.");
    } finally { setWahaBusy(false); }
  };

  const disconnectWaha = async () => {
    if (!window.confirm("Disconnect this WhatsApp number from this business? The saved WAHA login session will be logged out.")) return;
    setWahaBusy(true); setWahaError(""); setWahaNotice("");
    try {
      const token = await wahaAuth();
      const response = await fetch("https://twiga-api.twiga-ke.workers.dev/waha/disconnect",{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
        body:JSON.stringify({business_id:businessId,token})
      });
      const data = await response.json().catch(()=>({}));
      if (!response.ok || data.ok===false) throw new Error(data.error || "WhatsApp could not be disconnected.");
      setWahaStatus({status:"NOT_CONNECTED",connected:false,ready:true});
      setWahaQr(""); setWahaPairCode("");
      setWahaNotice(data.message || "WhatsApp disconnected.");
    } catch (error) {
      setWahaError(error instanceof Error ? error.message : "WhatsApp could not be disconnected.");
    } finally { setWahaBusy(false); }
  };

  useEffect(() => {
    void refreshWahaStatus();
  }, [businessId,demoMode]);

  useEffect(() => {
    if (demoMode || !businessId) return;
    const timer = window.setInterval(() => {
      void refreshWahaStatus();
    }, 7000);
    return () => window.clearInterval(timer);
  }, [businessId,demoMode]);

  const statusLabel = wahaStatus.status==="WORKING" ? "Connected" :
    wahaStatus.status==="SCAN_QR_CODE" ? "Scan QR code" :
    wahaStatus.status==="STARTING" ? "Starting" :
    wahaStatus.status==="SERVICE_UNAVAILABLE" ? "Reconnecting" :
    wahaStatus.runtimeStatus==="NEEDS_ADMIN_SETUP" ? "Admin setup required" :
    (wahaStatus.status || "Not connected").replace(/_/g," ");

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
            <CardTitle className="flex items-center gap-2 text-lg font-semibold"><IconChat className="h-5 w-5 text-orange-500"/> Connect WhatsApp</CardTitle>
            <CardDescription>Link the WhatsApp number for this business. Scan a QR code or use a phone pairing code.</CardDescription>
          </div>
          <Badge className={cn("border-0",wahaStatus.connected?"bg-orange-50 text-orange-800":wahaStatus.status==="SCAN_QR_CODE"?"bg-amber-50 text-amber-800":"bg-neutral-100 text-neutral-700")}>{statusLabel}</Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {wahaStatus.connected ? (
            <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4">
              <p className="text-sm font-semibold text-neutral-950">{wahaStatus.profileName || "WhatsApp Business"}{wahaStatus.phoneNumber ? " · "+wahaStatus.phoneNumber : ""}</p>
              <p className="mt-1 text-xs leading-5 text-neutral-600">This business's WhatsApp is linked. TWIGA can receive customer messages and voice notes, and can notify you when a person is requested.</p>
              <Button onClick={()=>void disconnectWaha()} disabled={wahaBusy} variant="outline" className="mt-3 border-neutral-300 text-neutral-800">Disconnect WhatsApp</Button>
            </div>
          ) : (
            <>
              {wahaStatus.runtimeStatus==="NEEDS_ADMIN_SETUP" && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">This business still needs its own WhatsApp session storage. TWIGA admin must assign this workspace's R2 bucket and access credentials before it can connect.</p>}
              <div className="flex flex-wrap gap-2">
                <Button onClick={()=>setWahaMode("qr")} variant={wahaMode==="qr"?"default":"outline"} className={wahaMode==="qr"?"bg-neutral-950 text-white hover:bg-neutral-800":""}>Scan QR code</Button>
                <Button onClick={()=>setWahaMode("code")} variant={wahaMode==="code"?"default":"outline"} className={wahaMode==="code"?"bg-neutral-950 text-white hover:bg-neutral-800":""}>Use phone number</Button>
              </div>
              {wahaMode==="qr" ? (
                <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                  <div className="grid min-h-[180px] place-items-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-3">
                    {wahaQr ? <img src={wahaQr} alt="Scan this QR code with WhatsApp on your phone" className="h-40 w-40 rounded-lg bg-white object-contain"/> : <div className="px-3 text-center"><IconChat className="mx-auto h-8 w-8 text-neutral-300"/><p className="mt-2 text-xs text-neutral-500">{wahaStatus.status==="SCAN_QR_CODE"?"QR code is loading…":"Start WhatsApp to show a QR code"}</p></div>}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-neutral-950">Link this business's WhatsApp</p>
                    <ol className="list-inside list-decimal space-y-1 text-xs leading-5 text-neutral-600">
                      <li>Open WhatsApp on the business phone.</li>
                      <li>Go to Settings or Menu → Linked devices.</li>
                      <li>Tap Link a device and scan the QR shown here.</li>
                    </ol>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button onClick={()=>void connectWaha()} disabled={wahaBusy||demoMode||wahaStatus.runtimeStatus==="NEEDS_ADMIN_SETUP"} className="bg-neutral-950 text-white hover:bg-neutral-800">{wahaBusy?"Starting…":"Start WhatsApp connection"}</Button>
                      <Button onClick={()=>void loadWahaQr()} disabled={wahaBusy||!wahaStatus.session} variant="outline">Refresh QR</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border border-neutral-200 p-4">
                  <p className="text-sm text-neutral-700">Enter the WhatsApp phone number including country code, without the plus sign.</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input value={wahaPairPhone} onChange={(event)=>setWahaPairPhone(event.target.value)} placeholder="254712345678"/>
                    <Button onClick={async()=>{if(!wahaStatus.session)await connectWaha();await requestWahaPairingCode();}} disabled={wahaBusy||demoMode||!wahaPairPhone.trim()||wahaStatus.runtimeStatus==="NEEDS_ADMIN_SETUP"} className="bg-neutral-950 text-white hover:bg-neutral-800">{wahaBusy?"Requesting…":"Get pairing code"}</Button>
                  </div>
                  {wahaPairCode && <div className="rounded-xl bg-neutral-950 p-4 text-center text-white"><p className="text-xs text-neutral-300">Enter this code in WhatsApp → Linked devices → Link with phone number</p><p className="mt-2 text-2xl font-bold tracking-[.25em] text-white">{wahaPairCode}</p></div>}
                </div>
              )}
            </>
          )}
          {wahaNotice && <p role="status" className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{wahaNotice}</p>}
          {wahaError && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{wahaError}</p>}
          <p className="text-[11px] leading-5 text-neutral-500">Each business gets its own WAHA session and assigned storage. QR re-login after container restarts depends on the assigned persistent storage being mounted and verified. Do not connect a personal number unless the business owner has approved it.</p>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-neutral-200 bg-white shadow-sm">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <IconChat className="h-5 w-5 text-orange-500" /> WhatsApp receptionist
            </CardTitle>
            <CardDescription>Optional alternative provider connection.</CardDescription>
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
