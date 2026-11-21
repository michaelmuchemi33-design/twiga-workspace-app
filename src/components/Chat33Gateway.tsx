import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const API = "https://twiga-api.twiga-ke.workers.dev";
type SocialAccount = { id:string; name:string; username?:string; platform:string; status?:string; avatarUrl?:string; slot:number };
type GatewaySlot = { slot:number; name:string; last4:string; connected:boolean; accounts:SocialAccount[]; accountCount:number; webhookConfigured?:boolean; error?:string };

async function workerRequest(businessId:string, path:string, method:"GET"|"POST"="GET", body?:Record<string,any>) {
  if (!supabase || !businessId) throw new Error("Sign in and select a business workspace first.");
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token || "";
  if (!token) throw new Error("Your sign-in has expired. Sign in again.");
  const url = API + path + (method === "GET" ? (path.includes("?") ? "&" : "?") + "business_id=" + encodeURIComponent(businessId) : "");
  const response = await fetch(url, {
    method,
    headers: { Authorization:"Bearer " + token, ...(method === "POST" ? {"Content-Type":"application/json"} : {}) },
    ...(method === "POST" ? {body:JSON.stringify({...body,business_id:businessId})} : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(String(data.error || "TWIGA could not complete this Chat33 request."));
  return data;
}

const platformNames:Record<string,string> = {
  instagram:"Instagram",facebook:"Facebook",tiktok:"TikTok",youtube:"YouTube",x:"X",twitter:"X",
  linkedin:"LinkedIn",bluesky:"Bluesky",threads:"Threads",messenger:"Messenger"
};

export function Chat33QuickPublisher({ compact=false }: { compact?:boolean }) {
  const {businessId,demoMode}=useStore();
  const [accounts,setAccounts]=useState<SocialAccount[]>([]);
  const [selected,setSelected]=useState<string[]>([]);
  const [caption,setCaption]=useState("");
  const [file,setFile]=useState<File|null>(null);
  const [scheduledAt,setScheduledAt]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const fileRef=useRef<HTMLInputElement|null>(null);
  const refresh=useCallback(async()=>{
    if(demoMode||!businessId){setAccounts([]);return;}
    const data=await workerRequest(businessId,"/chat33/status");
    const next=(Array.isArray(data.accounts)?data.accounts:[]) as SocialAccount[];
    setAccounts(next);
    setSelected((current)=>current.length?current.filter(id=>next.some(a=>a.id===id)):next.map(a=>a.id));
  },[businessId,demoMode]);
  useEffect(()=>{void refresh().catch(e=>setNotice(e instanceof Error?e.message:"Chat33 accounts could not be loaded."));},[refresh]);

  const toggle=(id:string)=>{
    setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
  };

  const publish=async()=>{
    if(demoMode){setNotice("Demo mode does not publish to real social accounts.");return;}
    if(!businessId||!selected.length){setNotice("Connect at least one Chat33 social channel and select it.");return;}
    if(!caption.trim()&&!file){setNotice("Add a caption or select a photo/video.");return;}
    const targets=accounts.filter(a=>selected.includes(a.id));
    if(targets.length!==selected.length){setNotice("One or more selected social channels are no longer available. Refresh accounts.");return;}
    const confirmText=(scheduledAt?"Schedule":"Publish")+" this content to "+targets.map(a=>platformNames[a.platform]||a.platform).join(", ")+":\n\n"+(caption.trim()||"[Media only]")+(scheduledAt?"\n\nScheduled: "+new Date(scheduledAt).toLocaleString():"");
    if(!window.confirm(confirmText))return;
    setBusy(true);setNotice(file?"Uploading media to each selected Chat33 workspace…":"Validating and publishing your post…");
    try{
      const groupsBySlot=new Map<number,SocialAccount[]>();
      for(const account of targets){const group=groupsBySlot.get(account.slot)||[];group.push(account);groupsBySlot.set(account.slot,group);}
      const mediaBySlot:Record<number,string[]>={};
      if(file){
        for(const slot of groupsBySlot.keys()){
          const signed=await workerRequest(businessId,"/chat33/media-upload-url","POST",{slot,filename:file.name,contentType:file.type||"application/octet-stream",sizeBytes:file.size});
          const uploadUrl=String(signed.uploadUrl||signed.upload_url||"");
          if(!uploadUrl)throw new Error("Chat33 did not return a direct upload URL.");
          const put=await fetch(uploadUrl,{method:"PUT",headers:signed.headers||{"Content-Type":file.type||"application/octet-stream"},body:file});
          const uploaded=await put.json().catch(()=>({}));
          if(!put.ok)throw new Error(String(uploaded.error||"Media upload failed for Chat33 account "+slot+"."));
          const url=String(uploaded.url||uploaded.mediaUrl||uploaded.publicUrl||signed.url||"");
          if(!url)throw new Error("Chat33 did not return a hosted media URL for "+file.name+".");
          mediaBySlot[slot]=[url];
        }
      }
      const groups=Array.from(groupsBySlot.entries()).map(([slot,items])=>({slot,accountIds:items.map(item=>item.id),mediaUrls:mediaBySlot[slot]||[]}));
      const results=await workerRequest(businessId,"/chat33/publish","POST",{
        groups,text:caption.trim(),
        mediaType:file?(file.type.startsWith("video/")?"video":"image"):"",
        scheduledAt:scheduledAt?new Date(scheduledAt).toISOString():""
      });
      const failures=(results.results||[]).filter((item:any)=>!item.ok);
      setNotice(failures.length?("Some publishing groups need attention: "+failures.map((item:any)=>"account "+item.slot+": "+item.error).join(" · ")):(scheduledAt?"Your posts were accepted and scheduled by Chat33.":"Chat33 accepted your posts for publishing.") );
      if(!failures.length){setCaption("");setFile(null);setScheduledAt("");if(fileRef.current)fileRef.current.value="";}
    }catch(error){setNotice(error instanceof Error?error.message:"Could not publish through Chat33.");}
    finally{setBusy(false);}
  };

  return (
    <Card className="rounded-2xl border-neutral-200 bg-white shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><CardTitle className="text-lg font-semibold text-neutral-950">Publish to your socials</CardTitle><CardDescription>One caption and media upload, delivered to the selected Chat33 channels.</CardDescription></div>
          <Badge className="border-neutral-200 bg-neutral-50 text-neutral-700">{selected.length} selected</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {accounts.length===0 ? <div className="rounded-xl border border-dashed border-neutral-300 p-4 text-sm text-neutral-600">No connected Chat33 channels found. Connect a Chat33 API account in <strong>The 10 core functions</strong>, then connect its social channels in Chat33.</div> :
          <div className="grid gap-2 sm:grid-cols-2">
            {accounts.map(account=><label key={account.slot+":"+account.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-neutral-200 p-3 hover:border-orange-300">
              <input type="checkbox" checked={selected.includes(account.id)} onChange={()=>toggle(account.id)} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-neutral-900">{account.name}</span><span className="block text-xs text-neutral-500">{platformNames[account.platform]||account.platform} · Chat33 account {account.slot}</span></span>
              <Badge className="border-green-200 bg-green-50 text-green-700">Connected</Badge>
            </label>)}
          </div>}
        <textarea value={caption} onChange={e=>setCaption(e.target.value)} rows={compact?3:4} placeholder="Write one post caption for your selected social accounts…" className="w-full rounded-xl border border-neutral-200 bg-white p-3 text-sm text-neutral-900 outline-none focus:border-orange-400" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-neutral-300 p-3 text-sm font-semibold text-neutral-700 hover:border-orange-400">
            <input ref={fileRef} type="file" accept="image/*,video/*" className="sr-only" onChange={(e:ChangeEvent<HTMLInputElement>)=>setFile(e.target.files?.[0]||null)} />
            {file ? "Selected: "+file.name : "Add photo or video"}
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">Schedule (optional)<input type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)} min={new Date(Date.now()+60000).toISOString().slice(0,16)} className="h-11 rounded-xl border border-neutral-200 px-3 text-sm text-neutral-900" /></label>
        </div>
        {file && <p className="text-xs text-neutral-500">{file.type.startsWith("video/")?"Video":"Image"} · {(file.size/1024/1024).toFixed(1)} MB. Chat33 direct upload supports files up to 500 MB per upload URL.</p>}
        <div className="flex flex-wrap gap-2"><Button onClick={()=>void publish()} disabled={busy||!accounts.length||!selected.length} className="bg-neutral-950 text-white hover:bg-neutral-800">{busy?"Working…":scheduledAt?"Schedule post":"Publish to selected accounts"}</Button><Button variant="outline" onClick={()=>void refresh()} disabled={busy}>Refresh channels</Button></div>
        {notice&&<p role="status" className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{notice}</p>}
      </CardContent>
    </Card>
  );
}

export default function Chat33Gateway(){
  const {businessId,demoMode}=useStore();
  const [slots,setSlots]=useState<GatewaySlot[]>([]);
  const [keyDrafts,setKeyDrafts]=useState<Record<number,string>>({});
  const [secretDrafts,setSecretDrafts]=useState<Record<number,string>>({});
  const [nameDrafts,setNameDrafts]=useState<Record<number,string>>({});
  const [busySlot,setBusySlot]=useState<number|null>(null);
  const [notice,setNotice]=useState("");
  const [loading,setLoading]=useState(false);
  const refresh=useCallback(async()=>{
    if(demoMode||!businessId){setSlots([]);return;}
    setLoading(true);
    try{const data=await workerRequest(businessId,"/chat33/status");setSlots(Array.isArray(data.slots)?data.slots:[]);}
    catch(error){setNotice(error instanceof Error?error.message:"Chat33 status could not be loaded.");}
    finally{setLoading(false);}
  },[businessId,demoMode]);
  useEffect(()=>{void refresh();},[refresh]);

  const save=async(slot:number)=>{
    if(demoMode){setNotice("Demo mode cannot connect real social accounts.");return;}
    setBusySlot(slot);setNotice("");
    try{
      const data=await workerRequest(businessId||"","/chat33/connection","POST",{action:"save",slot,apiKey:keyDrafts[slot]||"",webhookSecret:secretDrafts[slot]||"",displayName:nameDrafts[slot]||("Chat33 account "+slot)});
      setKeyDrafts(old=>({...old,[slot]:""}));setSecretDrafts(old=>({...old,[slot]:""}));
      setNotice("Chat33 account "+slot+" verified. "+Number(data.accountCount||0)+" channel(s) found.");
      await refresh();
    }catch(error){setNotice(error instanceof Error?error.message:"Chat33 connection could not be saved.");}
    finally{setBusySlot(null);}
  };
  const remove=async(slot:number)=>{
    if(!window.confirm("Remove this Chat33 API connection from this business? Its social channels will no longer be accessible through TWIGA."))return;
    setBusySlot(slot);
    try{await workerRequest(businessId||"","/chat33/connection","POST",{action:"delete",slot});setNotice("Chat33 account "+slot+" disconnected from TWIGA.");await refresh();}
    catch(error){setNotice(error instanceof Error?error.message:"Could not remove this Chat33 account.");}
    finally{setBusySlot(null);}
  };
  const configuredCount=slots.length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Social media gateway · optional</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950">The 10 core functions</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-700">Connect up to three Chat33 workspaces for this business. TWIGA uses their channels to publish content and bring supported social conversations into the business workspace. Social setup is optional; phone reception and the rest of TWIGA continue to work without it.</p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-white px-4 py-3 text-sm"><strong className="block text-xl text-neutral-950">{configuredCount}/3</strong><span className="text-neutral-500">Chat33 gateways</span></div>
        </div>
      </div>

      <Card className="rounded-2xl border-neutral-200 shadow-sm">
        <CardHeader><CardTitle>1. Connect Chat33 accounts</CardTitle><CardDescription>Each slot accepts one Chat33 workspace API key. You can use one, two or all three. Keys are encrypted in business-scoped Cloudflare D1; they are never sent to the setup chat or exposed to other businesses.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-700">
            <strong className="text-neutral-900">Create an API key in Chat33</strong>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Open Chat33 Settings → API Keys and create a new key.</li>
              <li>Enable: accounts:read, posts:read, posts:write, media:write, inbox:read, inbox:write, comments:read and comments:write.</li>
              <li>In Chat33, connect the social channels you want this business to use.</li>
              <li>Paste that API key into one of the slots below. TWIGA verifies it by reading the channel list.</li>
            </ol>
            <a href="https://chat33.io/settings" target="_blank" rel="noreferrer" className="mt-3 inline-flex font-semibold text-orange-700 underline">Open Chat33 Settings ↗</a>
          </div>
          {[1,2,3].map(slot=>{
            const existing=slots.find(item=>item.slot===slot);
            return <div key={slot} className="rounded-xl border border-neutral-200 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold text-neutral-950">Chat33 account {slot}</p><p className="text-xs text-neutral-500">{existing?"Key saved · ending "+existing.last4:"Optional · not connected"}</p></div>{existing&&<Badge className={existing.connected?"border-green-200 bg-green-50 text-green-700":"border-red-200 bg-red-50 text-red-700"}>{existing.connected?"Verified":"Needs attention"}</Badge>}</div>
              <div className="grid gap-3 md:grid-cols-2">
                <input value={nameDrafts[slot]??existing?.name??""} onChange={e=>setNameDrafts(old=>({...old,[slot]:e.target.value}))} placeholder="Connection name (e.g. Main brand)" className="h-11 rounded-lg border border-neutral-200 px-3 text-sm" />
                <input type="password" autoComplete="new-password" value={keyDrafts[slot]||""} onChange={e=>setKeyDrafts(old=>({...old,[slot]:e.target.value}))} placeholder={existing?"Paste a new API key to replace the saved key":"Paste Chat33 API key"} className="h-11 rounded-lg border border-neutral-200 px-3 text-sm" />
                <input type="password" autoComplete="new-password" value={secretDrafts[slot]||""} onChange={e=>setSecretDrafts(old=>({...old,[slot]:e.target.value}))} placeholder="Optional Chat33 message-webhook signing secret" className="h-11 rounded-lg border border-neutral-200 px-3 text-sm md:col-span-2" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2"><Button onClick={()=>void save(slot)} disabled={busySlot!==null||demoMode} className="bg-neutral-950 text-white">{busySlot===slot?"Verifying…":existing?"Update & verify":"Save & verify"}</Button>{existing&&<Button variant="outline" onClick={()=>void remove(slot)} disabled={busySlot!==null}>Remove</Button>}</div>
              {existing&&<p className="mt-3 text-xs text-neutral-500">{existing.accountCount} social channel(s) available{existing.webhookConfigured?" · Message webhook signing secret saved": " · Add a signing secret to enable TWIGA's real-time message webhook"}{existing.error?" · "+existing.error:""}</p>}
            </div>;
          })}
          {notice&&<p role="status" className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{notice}</p>}
          <div className="flex gap-2"><Button variant="outline" onClick={()=>void refresh()} disabled={loading}>{loading?"Checking…":"Refresh connections"}</Button><a href="https://chat33.io/settings" target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-800">Open Chat33</a></div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-neutral-200 shadow-sm">
        <CardHeader><CardTitle>2. Connected social channels</CardTitle><CardDescription>Channels are linked in your Chat33 workspace. TWIGA reads their names and status; it does not ask for social media passwords.</CardDescription></CardHeader>
        <CardContent>
          {slots.length===0?<p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500">No Chat33 workspace connected. This section is optional.</p>:<div className="grid gap-2 md:grid-cols-2">{slots.flatMap(slot=>slot.accounts.map(account=><div key={slot.slot+":"+account.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-neutral-900">{account.name}</p><p className="text-xs text-neutral-500">{platformNames[account.platform]||account.platform} · Chat33 {slot.slot}</p></div><Badge className="border-green-200 bg-green-50 text-green-700">{account.status||"Connected"}</Badge></div>))}</div>}
        </CardContent>
      </Card>

      <Chat33QuickPublisher />

      <Card className="rounded-2xl border-neutral-200 shadow-sm">
        <CardHeader><CardTitle>3. Message webhook (optional)</CardTitle><CardDescription>For new Instagram and Facebook Messenger messages to appear in TWIGA without waiting for an inbox refresh.</CardDescription></CardHeader>
        <CardContent className="space-y-2 text-sm text-neutral-700">
          <p>In Chat33 Settings → API Keys → Message webhook, set the endpoint below and enable new DMs. Copy its signing secret and save it in the matching gateway slot above.</p>
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-neutral-50 p-3"><code className="min-w-0 flex-1 break-all text-xs">https://twiga-api.twiga-ke.workers.dev/chat33/webhook</code><Button size="sm" variant="outline" onClick={()=>void navigator.clipboard?.writeText("https://twiga-api.twiga-ke.workers.dev/chat33/webhook")}>Copy URL</Button></div>
          <p className="text-xs text-neutral-500">TWIGA verifies Chat33's timestamped HMAC signature before saving message and contact data. Messages are kept in the correct business workspace.</p>
        </CardContent>
      </Card>
    </div>
  );
}
