import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const cors={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"content-type", "Access-Control-Allow-Methods":"POST, OPTIONS", "Content-Type":"application/json" };
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,"0")).join("");
async function pal(key:string,path:string){const r=await fetch("https://api.palpluss.com/v1"+path,{headers:{Authorization:"Basic "+btoa(key+":"),Accept:"application/json"}});const raw=await r.text();let p:any={};try{p=raw?JSON.parse(raw):{};}catch{p={message:raw.slice(0,300)};}return{ok:r.ok,status:r.status,data:p?.data??p};}
const phoneKE=(v:unknown)=>{let s=String(v||"").replace(/[\s()-]/g,"");if(s.startsWith("0"))s="+254"+s.slice(1);else if(s.startsWith("254"))s="+"+s;else if(/^[17]\d{8}$/.test(s))s="+254"+s;return /^\+254[17]\d{8}$/.test(s)?s:"";};
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"POST only"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!service)return reply({error:"Server not configured."},503);
 try{
  const token=new URL(req.url).searchParams.get("token")||"";
  if(!/^[a-f0-9]{64}$/i.test(token))return reply({error:"Invalid callback token."},401);
  const body=await req.json().catch(()=>null);if(!body)return reply({error:"Invalid callback payload."},400);
  const payload=body?.transaction||body?.data?.transaction||body?.data||body;
  const txId=String(payload?.transactionId||payload?.id||payload?.transaction_id||"").slice(0,160);
  const accountRef=String(payload?.accountReference||payload?.account_reference||payload?.external_reference||"").slice(0,120);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const tokenHash=await hash(token);
  const {data:intent,error}=await db.from("twiga_subscription_payment_intents").select("*").eq("callback_token_hash",tokenHash).maybeSingle();
  if(error)throw error;if(!intent)return reply({error:"Subscription payment request not found."},404);
  if(accountRef&&accountRef!==intent.account_reference)return reply({error:"Payment reference mismatch."},409);
  if(intent.status==="paid")return reply({received:true,paid:true,alreadyPaid:true});
  if(!txId)return reply({received:true,pending:true});
  const {error:txSaveError}=await db.from("twiga_subscription_payment_intents").update({provider_transaction_id:txId,provider_response:payload||{},updated_at:new Date().toISOString()}).eq("id",intent.id).neq("status","paid");
  if(txSaveError)throw txSaveError;
  const {data:key,error:keyError}=await db.rpc("twiga_get_platform_secret",{p_provider:"palpluss_platform_api_key"});
  if(keyError)throw keyError;if(!key)return reply({error:"Payment provider is not configured."},503);
  const verified=await pal(String(key),"/transactions/"+encodeURIComponent(txId));
  if(!verified.ok)return reply({error:"PalPluss transaction verification unavailable."},502);
  const tx=verified.data?.transaction&&typeof verified.data.transaction==="object"?verified.data.transaction:verified.data;
  const status=String(tx?.status||"").toUpperCase();
  if(status!=="SUCCESS"){
   const next=["FAILED","CANCELLED","REVERSED","EXPIRED"].includes(status)?status.toLowerCase():"pending";
   await db.from("twiga_subscription_payment_intents").update({status:next,provider_response:tx||{},updated_at:new Date().toISOString()}).eq("id",intent.id).neq("status","paid");
   return reply({received:true,paid:false,status:next});
  }
  if(Number(tx?.amount||0)!==Number(intent.amount)||String(tx?.currency||"KES").toUpperCase()!=="KES"){
   await db.from("twiga_subscription_payment_intents").update({status:"review_required",provider_transaction_id:txId,provider_response:tx||{},error_message:"Amount/currency mismatch.",updated_at:new Date().toISOString()}).eq("id",intent.id);
   return reply({received:true,paid:false,status:"review_required"});
  }
  const norm=phoneKE(tx?.phone_number||tx?.phone),expected=phoneKE(intent.phone);
  if(norm&&expected&&norm!==expected){
   await db.from("twiga_subscription_payment_intents").update({status:"review_required",provider_transaction_id:txId,provider_response:tx||{},error_message:"Payer phone mismatch.",updated_at:new Date().toISOString()}).eq("id",intent.id);
   return reply({received:true,paid:false,status:"review_required"});
  }
  const ref=String(tx?.transactionId||tx?.id||tx?.transaction_id||txId).slice(0,160);
  const {error:rpcError}=await db.rpc("twiga_record_platform_payment",{p_business_id:intent.business_id,p_amount:Number(intent.amount),p_method:"mpesa",p_reference:ref,p_notes:"Verified PalPluss subscription · "+String(intent.plan_code),p_period_start:null,p_period_end:null,p_recorded_by:intent.initiated_by||null});
  if(rpcError){
   if(rpcError.code!=="23505")throw rpcError;
   const {data:existing}=await db.from("twiga_platform_payments").select("business_id,amount").eq("method","mpesa").eq("provider_reference",ref).maybeSingle();
   if(!existing||existing.business_id!==intent.business_id||Number(existing.amount)!==Number(intent.amount))throw rpcError;
  }
  await db.from("twiga_subscription_payment_intents").update({status:"paid",provider_transaction_id:ref,provider_response:tx||{},verified_at:new Date().toISOString(),error_message:null,updated_at:new Date().toISOString()}).eq("id",intent.id);
  await db.from("twiga_admin_audit_logs").insert({admin_email:"subscription-checkout",action:"subscription.payment_verified",resource_type:"business",resource_id:intent.business_id,metadata:{intent_id:intent.id,plan_code:intent.plan_code,amount:Number(intent.amount),transaction_id:ref}});
  return reply({received:true,paid:true,status:"paid",transactionId:ref});
 }catch(e){console.error("TWIGA subscription webhook",e instanceof Error?e.message:e);return reply({error:"Could not process subscription callback."},500);}
});