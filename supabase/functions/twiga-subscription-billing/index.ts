import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
const cors={ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, apikey, content-type", "Access-Control-Allow-Methods":"POST, OPTIONS", "Content-Type":"application/json" };
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const phoneKE=(v:unknown)=>{let s=String(v||"").replace(/[\s()-]/g,"");if(s.startsWith("0"))s="+254"+s.slice(1);else if(s.startsWith("254"))s="+"+s;else if(/^[17]\d{8}$/.test(s))s="+254"+s;return /^\+254[17]\d{8}$/.test(s)?s:"";};
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,"0")).join("");
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,"0")).join("");
const plans:Record<string,{amount:number;label:string}>={starter:{amount:1650,label:"Starter"},professional:{amount:3000,label:"Professional"},business_pro:{amount:5000,label:"Business Pro"}};
async function pal(key:string,path:string,method="GET",body?:unknown){const r=await fetch("https://api.palpluss.com/v1"+path,{method,headers:{Authorization:"Basic "+btoa(key+":"),Accept:"application/json","Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});const raw=await r.text();let p:any={};try{p=raw?JSON.parse(raw):{};}catch{p={message:raw.slice(0,300)};}return{ok:r.ok,status:r.status,data:p?.data??p,error:p?.error??null};}
async function settle(db:any,intent:any,key:string,transactionId:string){
 if(intent.status==="paid")return{paid:true,alreadyPaid:true,status:"paid"};
 const result=await pal(key,"/transactions/"+encodeURIComponent(transactionId));
 if(!result.ok)return{paid:false,status:"verification_pending",message:"PalPluss could not verify the transaction yet. Check again shortly."};
 const tx=result.data?.transaction&&typeof result.data.transaction==="object"?result.data.transaction:result.data;
 const status=String(tx?.status||"").toUpperCase();
 if(status!=="SUCCESS"){
  const next=["FAILED","CANCELLED","REVERSED","EXPIRED"].includes(status)?status.toLowerCase():"pending";
  await db.from("twiga_subscription_payment_intents").update({status:next,provider_response:tx||{},updated_at:new Date().toISOString()}).eq("id",intent.id).neq("status","paid");
  return{paid:false,status:next,message:"Payment is not confirmed. Subscription access has not been activated."};
 }
 const amount=Number(tx?.amount||0),currency=String(tx?.currency||"KES").toUpperCase();
 if(!Number.isFinite(amount)||amount!==Number(intent.amount)||currency!=="KES"){
  await db.from("twiga_subscription_payment_intents").update({status:"review_required",provider_transaction_id:transactionId,provider_response:tx||{},error_message:"Verified amount or currency mismatch.",updated_at:new Date().toISOString()}).eq("id",intent.id);
  return{paid:false,status:"review_required",message:"Payment requires administrator review. Access has not been activated."};
 }
 const norm=(v:unknown)=>{let s=String(v||"").replace(/[\s()-]/g,"");if(s.startsWith("0"))s="+254"+s.slice(1);else if(s.startsWith("254"))s="+"+s;else if(/^[17]\d{8}$/.test(s))s="+254"+s;return /^\+254[17]\d{8}$/.test(s)?s:"";};
 const expected=norm(intent.phone),actual=norm(tx?.phone_number||tx?.phone);
 if(expected&&actual&&expected!==actual){
  await db.from("twiga_subscription_payment_intents").update({status:"review_required",provider_transaction_id:transactionId,provider_response:tx||{},error_message:"Payer phone mismatch.",updated_at:new Date().toISOString()}).eq("id",intent.id);
  return{paid:false,status:"review_required",message:"Payment requires administrator review. Access has not been activated."};
 }
 const ref=String(tx?.transactionId||tx?.id||tx?.transaction_id||transactionId).slice(0,160);
 const {error:rpcError}=await db.rpc("twiga_record_platform_payment",{p_business_id:intent.business_id,p_amount:Number(intent.amount),p_method:"mpesa",p_reference:ref,p_notes:"Verified PalPluss subscription · "+String(intent.plan_code),p_period_start:null,p_period_end:null,p_recorded_by:intent.initiated_by||null});
 if(rpcError){
  if(rpcError.code!=="23505")throw rpcError;
  const {data:existing}=await db.from("twiga_platform_payments").select("business_id,amount").eq("method","mpesa").eq("provider_reference",ref).maybeSingle();
  if(!existing||existing.business_id!==intent.business_id||Number(existing.amount)!==Number(intent.amount))throw rpcError;
 }
 await db.from("twiga_subscription_payment_intents").update({status:"paid",provider_transaction_id:ref,provider_response:tx||{},verified_at:new Date().toISOString(),error_message:null,updated_at:new Date().toISOString()}).eq("id",intent.id);
 await db.from("twiga_admin_audit_logs").insert({admin_email:"subscription-checkout",action:"subscription.payment_verified",resource_type:"business",resource_id:intent.business_id,metadata:{intent_id:intent.id,plan_code:intent.plan_code,amount:Number(intent.amount),transaction_id:ref}});
 return{paid:true,status:"paid",transactionId:ref,amount:Number(intent.amount),message:"PalPluss confirmed payment. TWIGA subscription access is active."};
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"POST only"},405);
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer "))return reply({error:"Sign in required."},401);
 const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!service)return reply({error:"TWIGA billing service is not configured."},503);
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await db.auth.getUser(auth.slice(7).trim());
 if(authError||!authData.user)return reply({error:"Session expired. Sign in again."},401);
 const user=authData.user;
 try{
  const body=await req.json().catch(()=>({})),action=String(body.action||"status"),businessId=String(body.businessId||"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(businessId))return reply({error:"Choose a valid business workspace."},400);
  const [{data:member,error:memberError},{data:adminRow,error:adminError}]=await Promise.all([
   db.from("business_members").select("role").eq("business_id",businessId).eq("user_id",user.id).maybeSingle(),
   db.from("twiga_platform_admins").select("user_id").eq("user_id",user.id).maybeSingle()
  ]);
  if(memberError||adminError)throw memberError||adminError;
  const isPlatformAdmin=!!adminRow,isBusinessAdmin=!!member&&["owner","admin"].includes(String(member.role));
  if(action==="status"){
   if(!member&&!isPlatformAdmin)return reply({error:"You do not have access to this business."},403);
   const [{data:subscription,error:subError},{data:recent,error:recentError},{data:keyRef,error:keyRefError}]=await Promise.all([
    db.from("twiga_subscriptions").select("plan_code,billing_interval,currency,amount,status,trial_started_at,trial_ends_at,current_period_start,current_period_end,grace_period_ends_at,last_payment_at").eq("business_id",businessId).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("twiga_subscription_payment_intents").select("id,plan_code,amount,phone,status,provider_transaction_id,created_at,expires_at,verified_at").eq("business_id",businessId).order("created_at",{ascending:false}).limit(5),
    db.from("twiga_platform_secret_refs").select("secret_last4,updated_at").eq("provider","palpluss_platform_api_key").maybeSingle()
   ]);
   if(subError||recentError||keyRefError)throw subError||recentError||keyRefError;
   return reply({ok:true,subscription:subscription||null,recentPayments:recent||[],paymentProviderConfigured:!!keyRef,paymentProviderLast4:keyRef?.secret_last4||null});
  }
  const adminAction=action==="admin_create_stk"||action==="admin_refresh";
  if(adminAction&&!isPlatformAdmin)return reply({error:"Platform administrator access required."},403);
  if(!adminAction&&!isBusinessAdmin)return reply({error:"Only this business's owner or administrator can manage its subscription."},403);
  if(action==="refresh"||action==="admin_refresh"){
   const intentId=String(body.intentId||"");
   if(!/^[0-9a-f-]{36}$/i.test(intentId))return reply({error:"Choose a valid payment request."},400);
   const {data:intent,error:intentError}=await db.from("twiga_subscription_payment_intents").select("*").eq("id",intentId).eq("business_id",businessId).maybeSingle();
   if(intentError)throw intentError;if(!intent)return reply({error:"Payment request not found."},404);
   if(intent.status==="paid")return reply({ok:true,paid:true,status:"paid",message:"This subscription payment is already confirmed."});
   if(intent.expires_at&&new Date(intent.expires_at).getTime()<Date.now())return reply({ok:true,paid:false,status:"expired",message:"This M-Pesa request has expired. Start a new payment request."});
   const {data:key,error:keyError}=await db.rpc("twiga_get_platform_secret",{p_provider:"palpluss_platform_api_key"});
   if(keyError)throw keyError;if(!key)return reply({error:"TWIGA's central PalPluss account is not connected."},409);
   const txId=String(intent.provider_transaction_id||"");
   if(!txId)return reply({ok:true,paid:false,status:"pending",message:"Waiting for PalPluss to return a transaction reference."});
   return reply({ok:true,...await settle(db,intent,String(key),txId)});
  }
  if(!["create_stk","admin_create_stk"].includes(action))return reply({error:"Unknown subscription billing action."},404);
  const planCode=String(body.planCode||"starter").toLowerCase(),plan=plans[planCode];
  if(!plan)return reply({error:"Choose a published TWIGA subscription plan."},400);
  const phone=phoneKE(body.phone);
  if(!phone)return reply({error:"Enter a Kenyan mobile number, e.g. 0712345678 or +254712345678."},400);
  const {data:key,error:keyError}=await db.rpc("twiga_get_platform_secret",{p_provider:"palpluss_platform_api_key"});
  if(keyError)throw keyError;if(!key)return reply({error:"TWIGA subscription M-Pesa is not connected yet. A platform administrator must securely connect the central PalPluss account in Profile → Platform connections."},409);
  const callbackToken=token(),callbackHash=await hash(callbackToken),accountReference="TWIGASUB-"+businessId.slice(0,8).toUpperCase()+"-"+Date.now();
  const {data:intent,error:intentError}=await db.from("twiga_subscription_payment_intents").insert({business_id:businessId,initiated_by:user.id,plan_code:planCode,amount:plan.amount,currency:"KES",phone,account_reference:accountReference,callback_token_hash:callbackHash,status:"pending",expires_at:new Date(Date.now()+15*60*1000).toISOString()}).select("id,business_id,plan_code,amount,phone,status,account_reference,expires_at").single();
  if(intentError)throw intentError;
  const callbackUrl="https://ztyxxikkposfpxsutnfr.supabase.co/functions/v1/twiga-subscription-webhook?token="+encodeURIComponent(callbackToken);
  const provider=await pal(String(key),"/payments/stk","POST",{amount:plan.amount,phone,accountReference,transactionDesc:"TWIGA "+plan.label+" monthly subscription",callbackUrl});
  if(!provider.ok){
   await db.from("twiga_subscription_payment_intents").update({status:"failed",error_message:String(provider.error?.message||provider.data?.message||"PalPluss could not start M-Pesa prompt.").slice(0,500),provider_response:provider.data||{},updated_at:new Date().toISOString()}).eq("id",intent.id);
   return reply({error:String(provider.error?.message||provider.data?.message||"PalPluss could not start the M-Pesa prompt.")},provider.status>=400&&provider.status<500?400:502);
  }
  const tx=provider.data?.transaction&&typeof provider.data.transaction==="object"?provider.data.transaction:provider.data||{};
  const txId=String(tx.transactionId||tx.id||tx.transaction_id||"").slice(0,160);
  const {error:updateError}=await db.from("twiga_subscription_payment_intents").update({provider_transaction_id:txId||null,merchant_request_id:String(tx.merchantRequestId||tx.merchant_request_id||"").slice(0,160)||null,provider_response:tx,updated_at:new Date().toISOString()}).eq("id",intent.id);
  if(updateError)throw updateError;
  await db.from("twiga_admin_audit_logs").insert({admin_email:user.email||"unknown",action:"subscription.payment_requested",resource_type:"business",resource_id:businessId,metadata:{intent_id:intent.id,plan_code:planCode,amount:plan.amount,phone,transaction_id:txId||null}});
  return reply({ok:true,intent:{...intent,provider_transaction_id:txId||null},message:"M-Pesa prompt requested. Access remains unchanged until PalPluss confirms SUCCESS."});
 }catch(e){console.error("TWIGA subscription billing error",e instanceof Error?e.message:e);return reply({error:e instanceof Error?e.message:"Could not process subscription request."},500);}
});