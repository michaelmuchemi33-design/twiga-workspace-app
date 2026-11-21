import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

const API="https://twiga-api.twiga-ke.workers.dev";
type Conversation=Record<string,any>&{_twigaSlot:number;_twigaAccountName:string};
type ChatMessage=Record<string,any>;
const titleCase=(v:string)=>v?v.charAt(0).toUpperCase()+v.slice(1):"Social";
const platformLabel=(v:string)=>({instagram:"Instagram",facebook:"Facebook",messenger:"Facebook Messenger",tiktok:"TikTok",youtube:"YouTube",linkedin:"LinkedIn",x:"X",threads:"Threads",bluesky:"Bluesky"}[v?.toLowerCase()]||titleCase(v||"Social"));

async function request(businessId:string,path:string,method:"GET"|"POST"="GET",body?:Record<string,any>){
  if(!supabase)throw new Error("TWIGA sign-in is unavailable.");
  const session=await supabase.auth.getSession();
  const token=session.data.session?.access_token||"";
  if(!token)throw new Error("Your sign-in has expired. Sign in again.");
  const url=API+path+(method==="GET"?(path.includes("?")?"&":"?")+"business_id="+encodeURIComponent(businessId):"");
  const response=await fetch(url,{method,headers:{Authorization:"Bearer "+token,...(method==="POST"?{"Content-Type":"application/json"}:{})},...(method==="POST"?{body:JSON.stringify({...body,business_id:businessId})}:{})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false)throw new Error(String(data.error||"Chat33 request failed."));
  return data;
}
function conversationIdOf(c:Conversation){return String(c.id||c.conversationId||c.conversation_id||"");}
function contactName(c:Conversation){const p=c.contact||c.customer||{};return String(p.name||p.displayName||p.username||p.handle||c.name||c.username||"Social contact");}
function latestText(c:Conversation){const m=c.lastMessage||c.last_message||c.latestMessage||{};return String(m.text||m.body||m.message||c.lastMessageText||c.preview||"");}
function timestamp(c:Conversation){return String(c.lastMessageAt||c.last_message_at||c.updatedAt||c.updated_at||c.lastActivityAt||"");}
function normalMessage(m:ChatMessage){return String(m.text||m.body||m.message||m.content||m.caption||"");}
function outgoing(m:ChatMessage){return m.fromMe===true||m.isOutgoing===true||m.direction==="outbound"||m.direction==="outgoing"||m.sender==="business";}

export default function Chat33Inbox(){
  const {businessId,demoMode}=useStore();
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [selected,setSelected]=useState<Conversation|null>(null);
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [draft,setDraft]=useState("");
  const [loading,setLoading]=useState(false);
  const [messagesLoading,setMessagesLoading]=useState(false);
  const [sending,setSending]=useState(false);
  const [notice,setNotice]=useState("");
  const [filter,setFilter]=useState("all");
  const refresh=useCallback(async()=>{
    if(!businessId||demoMode){setConversations([]);setSelected(null);return;}
    setLoading(true);
    try{
      const data=await request(businessId,"/chat33/inbox");
      const next=(Array.isArray(data.conversations)?data.conversations:[]) as Conversation[];
      setConversations(next);
      setSelected(current=>{
        if(!current)return next[0]||null;
        const id=conversationIdOf(current);
        return next.find(item=>conversationIdOf(item)===id&&item._twigaSlot===current._twigaSlot)||next[0]||null;
      });
      const errors=Array.isArray(data.errors)?data.errors:[];
      if(errors.length)setNotice("Some Chat33 workspaces could not load: "+errors.map((item:any)=>"account "+item.slot).join(", "));
      else setNotice("");
    }catch(error){setNotice(error instanceof Error?error.message:"Social inbox could not be loaded.");}
    finally{setLoading(false);}
  },[businessId,demoMode]);
  const loadMessages=useCallback(async(c:Conversation)=>{
    const id=conversationIdOf(c);
    if(!businessId||!id){setMessages([]);return;}
    setMessagesLoading(true);
    try{
      const data=await request(businessId,"/chat33/messages?slot="+c._twigaSlot+"&conversation_id="+encodeURIComponent(id));
      setMessages(Array.isArray(data.messages)?data.messages:[]);
    }catch(error){setMessages([]);setNotice(error instanceof Error?error.message:"Conversation messages could not be loaded.");}
    finally{setMessagesLoading(false);}
  },[businessId]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{if(selected)void loadMessages(selected);else setMessages([]);},[selected,loadMessages]);
  const filtered=useMemo(()=>conversations.filter(c=>filter==="all"||(c.platform||c.channel?.platform||"").toLowerCase()===filter),[conversations,filter]);
  const send=async()=>{
    if(!selected||!draft.trim()||sending)return;
    if(!window.confirm("Send this reply to "+contactName(selected)+" via "+platformLabel(selected.platform||selected.channel?.platform||"social")+"?"))return;
    setSending(true);
    try{
      const data=await request(businessId||"","/chat33/reply","POST",{slot:selected._twigaSlot,conversationId:conversationIdOf(selected),message:draft.trim()});
      setNotice(data.message||"Chat33 accepted the reply.");
      setDraft("");
      await loadMessages(selected);
    }catch(error){setNotice(error instanceof Error?error.message:"Chat33 could not send the reply.");}
    finally{setSending(false);}
  };
  const availablePlatforms=Array.from(new Set(conversations.map(c=>String(c.platform||c.channel?.platform||"").toLowerCase()).filter(Boolean)));
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Unified social inbox</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-950">Inbox</h1><p className="mt-1 text-sm text-neutral-500">Conversations from all connected Chat33 workspaces in this business.</p></div>
      <div className="flex items-center gap-2"><Badge className="border-neutral-200 bg-neutral-50 text-neutral-700">{conversations.length} conversations</Badge><Button variant="outline" onClick={()=>void refresh()} disabled={loading}>{loading?"Refreshing…":"Refresh inbox"}</Button></div>
    </div>
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950">
      Chat33’s documented DM inbox currently covers Instagram and Facebook Messenger. Publishing supports more social networks, but TikTok DMs and WhatsApp Business are not part of this inbox API at present. WhatsApp Business remains a separate direct Meta connection below.
    </div>
    <Card className="overflow-hidden rounded-2xl border-neutral-200 shadow-sm">
      <div className="grid min-h-[620px] lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="border-b border-neutral-200 lg:border-b-0 lg:border-r">
          <div className="border-b border-neutral-100 p-3">
            <div className="flex flex-wrap gap-1.5">
              <button onClick={()=>setFilter("all")} className={"rounded-full px-3 py-1.5 text-xs font-semibold "+(filter==="all"?"bg-neutral-950 text-white":"bg-neutral-100 text-neutral-600")}>All</button>
              {availablePlatforms.map(platform=><button key={platform} onClick={()=>setFilter(platform)} className={"rounded-full px-3 py-1.5 text-xs font-semibold "+(filter===platform?"bg-neutral-950 text-white":"bg-neutral-100 text-neutral-600")}>{platformLabel(platform)}</button>)}
            </div>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {filtered.length===0&&<div className="p-8 text-center text-sm text-neutral-500">{demoMode?"Social inbox is disabled in demo mode.":"No Chat33 conversations loaded. Connect an API key and enable the Chat33 message webhook."}</div>}
            {filtered.map(c=>{
              const id=conversationIdOf(c), active=selected&&conversationIdOf(selected)===id&&selected._twigaSlot===c._twigaSlot;
              return <button key={c._twigaSlot+":"+id} onClick={()=>setSelected(c)} className={"block w-full border-b border-neutral-100 p-4 text-left transition-colors "+(active?"bg-orange-50":"hover:bg-neutral-50")}>
                <div className="flex items-start justify-between gap-2"><p className="truncate text-sm font-semibold text-neutral-950">{contactName(c)}</p><span className="shrink-0 text-[10px] text-neutral-400">{timestamp(c)?new Date(timestamp(c)).toLocaleString():""}</span></div>
                <div className="mt-1 flex items-center gap-1.5"><span className="text-[11px] font-semibold text-orange-700">{platformLabel(c.platform||c.channel?.platform||"social")}</span><span className="text-[10px] text-neutral-400">· Chat33 {c._twigaSlot}</span></div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-500">{latestText(c)||"Open conversation"}</p>
              </button>;
            })}
          </div>
        </div>
        <div className="flex min-h-[620px] flex-col">
          {!selected?<div className="grid flex-1 place-items-center p-8 text-center text-sm text-neutral-500">Select a conversation to read and reply.</div>:<>
            <div className="border-b border-neutral-100 p-4">
              <p className="font-semibold text-neutral-950">{contactName(selected)}</p>
              <p className="mt-1 text-xs text-neutral-500">{platformLabel(selected.platform||selected.channel?.platform||"social")} · {selected._twigaAccountName} · account {selected._twigaSlot}</p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-neutral-50/60 p-4">
              {messagesLoading&&<p className="text-center text-xs text-neutral-500">Loading messages…</p>}
              {!messagesLoading&&messages.length===0&&<p className="text-center text-xs text-neutral-500">No messages were returned for this conversation.</p>}
              {messages.map((m,i)=><div key={String(m.id||m.messageId||i)} className={"flex "+(outgoing(m)?"justify-end":"justify-start")}><div className={"max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm "+(outgoing(m)?"rounded-br-sm bg-neutral-950 text-white":"rounded-bl-sm border border-neutral-200 bg-white text-neutral-800")}>{normalMessage(m)||"[Attachment or unsupported message]"}<p className={"mt-1 text-[10px] "+(outgoing(m)?"text-neutral-300":"text-neutral-400")}>{m.sentAt||m.createdAt||m.timestamp?new Date(m.sentAt||m.createdAt||m.timestamp).toLocaleString():""}</p></div></div>)}
            </div>
            <div className="border-t border-neutral-100 bg-white p-3">
              <textarea rows={3} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Write a reply…" className="w-full resize-y rounded-xl border border-neutral-200 p-3 text-sm text-neutral-900 outline-none focus:border-orange-400" />
              <div className="mt-2 flex items-center justify-between gap-2"><p className="text-[10px] text-neutral-500">Replies follow the platform’s messaging window and permissions.</p><Button onClick={()=>void send()} disabled={sending||!draft.trim()} className="bg-neutral-950 text-white">{sending?"Sending…":"Send reply"}</Button></div>
            </div>
          </>}
        </div>
      </div>
    </Card>
    {notice&&<p role="status" className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{notice}</p>}
  </div>;
}
