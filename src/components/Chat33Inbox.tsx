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

export default function Chat33Inbox({ onOpenCoreFunctions }: { onOpenCoreFunctions?: () => void }) {
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
  const [comments,setComments]=useState<Record<string,any>[]>([]);
  const [commentsLoading,setCommentsLoading]=useState(false);
  const [commentsErrors,setCommentsErrors]=useState<{slot:number;error:string}[]>([]);
  const [selectedComment,setSelectedComment]=useState<Record<string,any>|null>(null);
  const [commentDraft,setCommentDraft]=useState("");
  const [commentVisibility,setCommentVisibility]=useState<"public"|"private">("public");
  const [commentSending,setCommentSending]=useState(false);
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
  const refreshComments=useCallback(async()=>{
    if(!businessId||demoMode){setComments([]);setCommentsErrors([]);setSelectedComment(null);return;}
    setCommentsLoading(true);
    try{
      const data=await request(businessId,"/chat33/comments");
      const next=Array.isArray(data.comments)?data.comments as Record<string,any>[]:[];
      setComments(next);
      setCommentsErrors(Array.isArray(data.errors)?data.errors:[]);
      setSelectedComment(current=>current?next.find(item=>item.id===current.id&&item.slot===current.slot)||null:next[0]||null);
    }catch(error){
      setCommentsErrors([{slot:0,error:error instanceof Error?error.message:"Comments could not be loaded."}]);
    }finally{setCommentsLoading(false);}
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
  useEffect(()=>{
    // Keep conversations from all three Chat33 workspaces and official Meta WhatsApp current.
    const timer=window.setInterval(()=>{void refresh();},30000);
    return ()=>window.clearInterval(timer);
  },[refresh]);
  useEffect(()=>{if(selected)void loadMessages(selected);else setMessages([]);},[selected,loadMessages]);
  useEffect(()=>{
    void refreshComments();
    const timer=window.setInterval(()=>{void refreshComments();},180000);
    return ()=>window.clearInterval(timer);
  },[refreshComments]);
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
  const sendCommentReply=async()=>{
    if(!selectedComment||!commentDraft.trim()||commentSending)return;
    const mode=commentVisibility==="private"?"private DM":"public comment";
    if(!window.confirm("Send this "+mode+" reply to "+String(selectedComment.authorName||selectedComment.username||"this person")+" on "+platformLabel(String(selectedComment.platform||"social"))+"?\n\n"+commentDraft.trim()))return;
    setCommentSending(true);
    try{
      const data=await request(businessId||"","/chat33/comment-reply","POST",{
        slot:Number(selectedComment.slot),postId:String(selectedComment.postId),commentId:String(selectedComment.commentId||selectedComment.id),
        channelId:String(selectedComment.channelId||""),message:commentDraft.trim(),visibility:commentVisibility
      });
      setNotice(data.message||"Chat33 accepted the comment reply.");
      setCommentDraft("");
      await refreshComments();
    }catch(error){setNotice(error instanceof Error?error.message:"Chat33 could not send the comment reply.");}
    finally{setCommentSending(false);}
  };
  const availablePlatforms=Array.from(new Set(conversations.map(c=>String(c.platform||c.channel?.platform||"").toLowerCase()).filter(Boolean)));
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-orange-600">Unified social inbox</p><h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-950">Unified Inbox</h1><p className="mt-1 text-sm text-neutral-500">Instagram and Facebook Messenger DMs from all three Chat33 slots, plus this business’s optional official Meta WhatsApp conversations.</p></div>
      <div className="flex flex-wrap items-center gap-2"><Badge className="border-neutral-200 bg-neutral-50 text-neutral-700">{conversations.length} conversations</Badge>{onOpenCoreFunctions&&<Button variant="outline" onClick={onOpenCoreFunctions}>Manage social accounts</Button>}<Button variant="outline" onClick={()=>void refresh()} disabled={loading}>{loading?"Refreshing…":"Refresh inbox"}</Button></div>
    </div>
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950">
      Chat33 publishing covers Instagram, Facebook, TikTok, YouTube, X, LinkedIn, Bluesky and Threads. Its live DM inbox is Instagram and Facebook Messenger; its comment tools cover supported Meta post comments. WhatsApp Business remains the separate official Meta connection until Chat33 launches WhatsApp support. TikTok DMs and TikTok commenter identities are not currently exposed by Chat33.
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
                <div className="mt-1 flex items-center gap-1.5"><span className="text-[11px] font-semibold text-orange-700">{platformLabel(c.platform||c.channel?.platform||"social")}</span><span className="text-[10px] text-neutral-400">· {c._twigaSlot===0?"Meta WhatsApp":"Chat33 "+c._twigaSlot}</span></div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-500">{latestText(c)||"Open conversation"}</p>
              </button>;
            })}
          </div>
        </div>
        <div className="flex min-h-[620px] flex-col">
          {!selected?<div className="grid flex-1 place-items-center p-8 text-center text-sm text-neutral-500">Select a conversation to read and reply.</div>:<>
            <div className="border-b border-neutral-100 p-4">
              <p className="font-semibold text-neutral-950">{contactName(selected)}</p>
              <p className="mt-1 text-xs text-neutral-500">{platformLabel(selected.platform||selected.channel?.platform||"social")} · {selected._twigaSlot===0?"Official WhatsApp Business · Meta":selected._twigaAccountName+" · Chat33 account "+selected._twigaSlot}</p>
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
    <Card className="rounded-2xl border-neutral-200 shadow-sm">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div><CardTitle>Social post comments</CardTitle><CardDescription>Recent comments on supported Instagram and Facebook posts across connected Chat33 workspaces.</CardDescription></div>
        <div className="flex items-center gap-2"><Badge className="border-neutral-200 bg-neutral-50 text-neutral-700">{comments.length} comments</Badge><Button variant="outline" onClick={()=>void refreshComments()} disabled={commentsLoading}>{commentsLoading?"Loading…":"Refresh comments"}</Button></div>
      </CardHeader>
      <CardContent className="space-y-4">
        {commentsErrors.length>0&&<p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">{commentsErrors.map(item=>(item.slot?"Chat33 account "+item.slot+": ":"Comments: ")+item.error).join(" · ")}</p>}
        {commentsLoading&&comments.length===0&&<p className="py-6 text-center text-sm text-neutral-500">Loading recent comments from Chat33…</p>}
        {!commentsLoading&&comments.length===0&&commentsErrors.length===0&&<p className="rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">No recent comments were returned. Enable comments:read for connected Chat33 accounts and check whether supported posts have comments.</p>}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.8fr)]">
          <div className="max-h-[520px] space-y-2 overflow-y-auto">
            {comments.map(item=>{
              const active=selectedComment?.id===item.id&&selectedComment?.slot===item.slot;
              return <button key={item.slot+":"+item.id} onClick={()=>setSelectedComment(item)} className={"w-full rounded-xl border p-3 text-left transition-colors "+(active?"border-orange-400 bg-orange-50":"border-neutral-200 hover:border-orange-200")}>
                <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-neutral-950">{item.authorName||item.username||"Social contact"}</p><span className="shrink-0 text-[10px] text-neutral-400">{item.createdAt?new Date(item.createdAt).toLocaleString():""}</span></div>
                <p className="mt-1 text-xs text-orange-700">{platformLabel(String(item.platform||"social"))} · Chat33 account {item.slot}</p>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-5 text-neutral-700">{item.text||"Comment"}</p>
                {item.postText&&<p className="mt-2 line-clamp-1 text-[11px] text-neutral-400">On: {item.postText}</p>}
              </button>;
            })}
          </div>
          {selectedComment?<div className="space-y-3 rounded-xl border border-neutral-200 p-4">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-orange-700">Reply to comment</p><p className="mt-1 text-sm font-semibold text-neutral-950">{selectedComment.authorName||selectedComment.username||"Social contact"}</p><p className="mt-1 whitespace-pre-wrap text-sm text-neutral-600">{selectedComment.text}</p>{selectedComment.postUrl&&<a href={selectedComment.postUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-orange-700 underline">View original post</a>}</div>
            <label className="block text-xs font-semibold text-neutral-700">Reply type<select value={commentVisibility} onChange={e=>setCommentVisibility(e.target.value as "public"|"private")} className="mt-1.5 h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm"><option value="public">Public reply under the comment</option><option value="private">Private reply by DM</option></select></label>
            <textarea rows={4} value={commentDraft} onChange={e=>setCommentDraft(e.target.value)} placeholder="Write a helpful reply…" className="w-full rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-orange-400"/>
            <Button onClick={()=>void sendCommentReply()} disabled={commentSending||!commentDraft.trim()} className="w-full bg-neutral-950 text-white">{commentSending?"Sending…":"Send comment reply"}</Button>
            <p className="text-[10px] leading-5 text-neutral-500">Meta allows one private reply per comment within seven days. Other replies remain subject to platform rules.</p>
          </div>:<div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-neutral-200 p-6 text-center text-sm text-neutral-500">Select a comment to review and reply.</div>}
        </div>
      </CardContent>
    </Card>
    {notice&&<p role="status" className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-700">{notice}</p>}
  </div>;
}
