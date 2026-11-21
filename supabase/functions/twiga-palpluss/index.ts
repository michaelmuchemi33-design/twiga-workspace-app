import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const sha256=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");
async function palRequest(key:string,path:string,method="GET",body?:unknown){
 const res=await fetch("https://api.palpluss.com/v1"+path,{method,headers:{Authorization:"Basic "+btoa(key+":"),"Content-Type":"application/json",Accept:"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const raw=await res.text();let parsed:any={};try{parsed=raw?JSON.parse(raw):{};}catch{parsed={message:raw.slice(0,500)};}
 return {ok:res.ok,status:res.status,data:parsed?.data??parsed,error:parsed?.error??null};
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"POST only"},405);
 const auth=req.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return reply({error:"Sign in required."},401);
 const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!service)return reply({error:"TWIGA server is not configured."},503);
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await db.auth.getUser(auth.slice(7).trim());
 if(authError||!authData.user)return reply({error:"Session expired. Sign in again."},401);
 const user=authData.user;
 try{
  const body=await req.json().catch(()=>({})),businessId=String(body.businessId||""),action=String(body.action||"get_config");
  if(!businessId)return reply({error:"Choose a business workspace first."},400);
  const {data:member}=await db.from("business_members").select("role").eq("business_id",businessId).eq("user_id",user.id).maybeSingle();
  if(!member)return reply({error:"You do not have access to this business."},403);
  if(["save_key","save_paylink","stk","channel.create"].includes(action)&&!["owner","admin"].includes(String(member.role)))return reply({error:"Only the business owner or administrator can manage payment settings."},403);

  if(action==="save_paylink"){
   const paylinkId=String(body.paylinkId||"").trim();
   if(!/^[A-Za-z0-9_-]{6,120}$/.test(paylinkId))return reply({error:"Enter the public PalPluss Paylink ID from the PalPluss console."},400);
   const {error:saveError}=await db.from("twiga_business_settings").upsert({
    business_id:businessId,palpluss_paylink_id:paylinkId,updated_at:new Date().toISOString()
   },{onConflict:"business_id"});
   if(saveError){console.error("PalPluss paylink ID save failed",saveError.message);return reply({error:"Could not save this business's PalPluss Paylink ID."},500);}
   return reply({saved:true,paylinkId,message:"The public PalPluss Paylink ID was saved for this business. The private API key stays in encrypted Vault."});
  }

  if(action==="save_key"){
   const apiKeyInput=String(body.apiKey||"").trim();
   const basicInput=String(body.basicAuthorization||body.base64Authorization||"").trim();
   if(apiKeyInput && basicInput)return reply({error:"Enter either the PalPluss API key or its Base64 Basic Authorization value, not both."},400);
   let key=apiKeyInput;
   if(basicInput){
    const encoded=basicInput.replace(/^Basic\s+/i,"").replace(/\s+/g,"");
    try{
     const decoded=atob(encoded);
     if(!decoded.endsWith(":")||decoded.length<22)return reply({error:"The Base64 value is not a PalPluss Basic credential. It must decode to API_KEY: with an empty password. Do not paste a Safaricom Daraja OAuth token here."},400);
     key=decoded.slice(0,-1);
    }catch{
     return reply({error:"The Base64 value is invalid. Paste the Base64 part of the PalPluss Basic header or the complete 'Basic …' header."},400);
    }
   }
   if(key.length<20||key.length>500)return reply({error:"Enter a valid PalPluss API key or Basic Base64 credential."},400);
   const check=await palRequest(key,"/wallets/service/balance");
   if(!check.ok)return reply({error:check.status===401?"PalPluss rejected this credential. Check that the API key belongs to the correct PalPluss account.":String(check.error?.message||check.data?.message||"Could not validate the PalPluss key or account.")},check.status===401?401:400);
   const {data:last4,error}=await db.rpc("twiga_set_palpluss_secret",{p_business_id:businessId,p_secret:key,p_updated_by:user.id});
   if(error){console.error("PalPluss Vault save failed",error.message);return reply({error:"The credential validated but could not be stored securely."},500);}
   return reply({saved:true,keyLast4:last4,balance:check.data,message:"PalPluss credential validated and saved in encrypted Supabase Vault. TWIGA stores the API key and creates the Base64 Basic Authorization header server-side."});
  }

  const {data:businessSecret,error:secretError}=await db.rpc("twiga_get_provider_secret",{p_business_id:businessId,p_provider:"palpluss"});
  const {data:platformSecret}=await db.rpc("twiga_get_platform_secret",{p_provider:"palpluss_platform_api_key"});
  const secret=platformSecret||businessSecret;
  const keySource=platformSecret?"platform":businessSecret?"business":"missing";
  if(secretError&&!secret)console.error("PalPluss business key lookup failed",secretError.message);
  if(!secret){
   if(action==="get_config"){
    const {data:businessSettings}=await db.from("twiga_business_settings").select("palpluss_paylink_id").eq("business_id",businessId).maybeSingle();
    return reply({keyConfigured:false,keySource:"missing",paylinkId:businessSettings?.palpluss_paylink_id||""});
   }
   return reply({error:"The TWIGA platform administrator must connect the central PalPluss account, or this business must connect its own account."},409);
  }
  const key=String(secret);

  if(action==="get_config"||action==="balance"){
   const result=await palRequest(key,"/wallets/service/balance");
   if(!result.ok)return reply({error:"Could not read the PalPluss service wallet."},502);
   const {data:ref}=await db.from("twiga_provider_secret_refs").select("secret_last4,updated_at").eq("business_id",businessId).eq("provider","palpluss").maybeSingle();
   const {data:platformRef}=await db.from("twiga_platform_secret_refs").select("secret_last4,updated_at").eq("provider","palpluss_platform_api_key").maybeSingle();
   const activeRef=ref||platformRef;
   const {data:businessSettings}=await db.from("twiga_business_settings").select("palpluss_paylink_id").eq("business_id",businessId).maybeSingle();
   return reply({
    keyConfigured:true,keyLast4:activeRef?.secret_last4||"",keyUpdatedAt:activeRef?.updated_at||null,
    keySource,balance:result.data,paylinkId:businessSettings?.palpluss_paylink_id||""
   });
  }

  if(action==="channel.list"){
   const {data:channels,error}=await db.from("twiga_palpluss_channels").select("*").eq("business_id",businessId).order("is_default",{ascending:false}).order("created_at",{ascending:false});
   if(error)return reply({error:"Could not load this business's payment channels."},500);
   return reply({channels:channels||[]});
  }

  if(action==="channel.create"){
   const name=String(body.name||"").trim(),shortcode=String(body.shortcode||"").trim(),type=String(body.type||"PAYBILL");
   const accountNumber=String(body.accountNumber||"").trim();
   if(!name||!shortcode||!["PAYBILL","TILL_NUMBER","SEND_MONEY"].includes(type))return reply({error:"Enter a channel name, shortcode and valid channel type."},400);
   if(type==="PAYBILL"&&!accountNumber)return reply({error:"A Paybill requires its account number."},400);
   const result=await palRequest(key,"/payment-wallet/channels","POST",{name,shortcode,type,accountNumber:accountNumber||undefined,isDefault:body.isDefault===true});
   if(!result.ok)return reply({error:String(result.error?.message||result.data?.message||"Could not create payment channel.")},result.status||502);
   const channel=result.data||{};
   const providerId=String(channel.id||channel.channelId||channel.shortcode||shortcode);
   if(body.isDefault===true) await db.from("twiga_palpluss_channels").update({is_default:false}).eq("business_id",businessId);
   const {data:saved,error:saveError}=await db.from("twiga_palpluss_channels").upsert({
    business_id:businessId,provider_channel_id:providerId,name,type,shortcode,
    account_number:accountNumber||null,is_default:body.isDefault===true,created_by:user.id
   },{onConflict:"business_id,provider_channel_id"}).select("*").single();
   if(saveError){console.error("PalPluss channel record save failed",saveError.message);return reply({error:"PalPluss registered the channel, but TWIGA could not save its business mapping."},500);}
   return reply({channel:saved,provider:channel});
  }

  if(action==="stk"){
   const amount=Number(body.amount),phone=String(body.phone||"").replace(/[\s-]/g,"");
   if(!Number.isFinite(amount)||amount<1)return reply({error:"Enter a valid payment amount in KES."},400);
   if(!/^(?:0?7|0?1|2547|2541|\+2547|\+2541)[0-9]{8}$/.test(phone))return reply({error:"Enter a valid Kenyan mobile number."},400);
   const tokenBytes=crypto.getRandomValues(new Uint8Array(32));
   const webhookToken=Array.from(tokenBytes).map(x=>x.toString(16).padStart(2,"0")).join("");
   const webhookTokenHash=await sha256(webhookToken);
   const callbackUrl="https://ztyxxikkposfpxsutnfr.supabase.co/functions/v1/twiga-palpluss-webhook?business_id="+encodeURIComponent(businessId)+"&token="+encodeURIComponent(webhookToken);
   const payload:Record<string,unknown>={amount,phone,accountReference:String(body.accountReference||("TWIGA-"+Date.now())).slice(0,120),transactionDesc:String(body.transactionDesc||"TWIGA business payment").slice(0,255),callbackUrl};
   if(body.channelId)payload.channelId=String(body.channelId);
   const result=await palRequest(key,"/payments/stk","POST",payload);
   if(!result.ok)return reply({error:String(result.error?.message||result.data?.message||"PalPluss could not start the M-Pesa prompt.")},result.status||502);
   const tx=result.data||{};
   if(tx.transactionId){
    const {error}=await db.from("twiga_palpluss_transactions").upsert({business_id:businessId,transaction_id:tx.transactionId,transaction_type:"STK",status:tx.status||"PENDING",amount,currency:tx.currency||"KES",phone:tx.phone||phone,account_reference:tx.accountReference||payload.accountReference,transaction_desc:tx.transactionDesc||payload.transactionDesc,provider_request_id:tx.providerRequestId||null,provider_checkout_id:tx.providerCheckoutId||null,webhook_token_hash:webhookTokenHash,response_data:tx,updated_at:new Date().toISOString()},{onConflict:"business_id,transaction_id"});
    if(error)console.error("PalPluss transaction save failed",error.message);
   }
   return reply({transaction:tx,message:"M-Pesa prompt initiated. Payment status will update from the PalPluss webhook; it is not confirmed until SUCCESS."});
  }

  if(action==="order.verify_paylink_payment"){
   const orderId=String(body.orderId||"").trim(),transactionId=String(body.transactionId||"").trim();
   if(!/^[0-9a-f-]{36}$/i.test(orderId)||!transactionId||transactionId.length>160)
    return reply({error:"A valid order and PalPluss transaction ID are required."},400);
   const {data:order,error:orderError}=await db.from("twiga_orders")
    .select("id,order_number,customer_name,customer_phone,total_amount,payment_status,palpluss_transaction_id")
    .eq("business_id",businessId).eq("id",orderId).maybeSingle();
   if(orderError)throw orderError;
   if(!order)return reply({error:"This order was not found in the selected business."},404);
   if(String(order.payment_status||"").toLowerCase()==="paid" && order.palpluss_transaction_id===transactionId)
    return reply({verified:true,alreadyVerified:true,transactionId,message:"This order is already paid with this verified PalPluss transaction."});
   if(String(order.payment_status||"").toLowerCase()==="paid")
    return reply({error:"This order is already marked paid. Do not attach a second payment."},409);
   const used=await db.from("twiga_orders").select("id,order_number")
    .eq("business_id",businessId).eq("palpluss_transaction_id",transactionId).neq("id",orderId).maybeSingle();
   if(used.error)throw used.error;
   if(used.data)return reply({error:"This PalPluss transaction is already attached to another order."},409);

   const result=await palRequest(key,"/transactions/"+encodeURIComponent(transactionId));
   if(!result.ok)return reply({error:"PalPluss could not verify this transaction. Check the transaction ID and try again."},502);
   const tx=result.data?.transaction||result.data;
   const status=String(tx.status||"").toUpperCase();
   if(status!=="SUCCESS")return reply({verified:false,status,message:"PalPluss has not confirmed this transaction as SUCCESS yet. The order remains unpaid."},409);
   const expected=Number(order.total_amount||0),paid=Number(tx.amount||0);
   if(!Number.isFinite(paid)||Math.abs(paid-expected)>0.001)
    return reply({error:"The verified PalPluss amount does not match this order. The order remains unpaid."},409);
   const normalPhone=(value:string)=>String(value||"").replace(/[\s().-]/g,"").replace(/^\+/,"").replace(/^0([17])/,"254$1");
   const orderPhone=normalPhone(String(order.customer_phone||""));
   const paymentPhone=normalPhone(String(tx.phone_number||tx.phone||""));
   if(orderPhone && paymentPhone && orderPhone!==paymentPhone)
    return reply({error:"The paid phone number does not match the customer on this order. The order remains unpaid."},409);
   const {error:updateError}=await db.from("twiga_orders").update({
    payment_status:"paid",payment_method:"MPESA_PAYLINK",palpluss_transaction_id:transactionId
   }).eq("business_id",businessId).eq("id",orderId).neq("payment_status","paid");
   if(updateError)throw updateError;
   await db.from("twiga_palpluss_transactions").upsert({
    business_id:businessId,transaction_id:transactionId,transaction_type:"PAYLINK",status:"SUCCESS",
    amount:paid,currency:String(tx.currency||"KES"),phone:tx.phone_number||tx.phone||order.customer_phone||null,
    account_reference:order.order_number||null,transaction_desc:"PalPluss hosted Paylink · order "+String(order.order_number||order.id),
    mpesa_receipt:tx.mpesa_receipt||tx.receipt_number||null,response_data:tx,updated_at:new Date().toISOString()
   },{onConflict:"business_id,transaction_id"});
   return reply({verified:true,transactionId,status:"SUCCESS",amount:paid,orderId,message:"PalPluss verified the payment and TWIGA marked this order as paid."});
  }

  if(action==="transaction.get"){
   const id=String(body.transactionId||"");if(!id)return reply({error:"Transaction ID is required."},400);
   const result=await palRequest(key,"/transactions/"+encodeURIComponent(id));
   if(!result.ok)return reply({error:"Could not retrieve this PalPluss transaction."},502);
   const tx=result.data?.transaction||result.data;
   await db.from("twiga_palpluss_transactions").upsert({business_id:businessId,transaction_id:id,transaction_type:tx.type||"STK",status:tx.status||"PENDING",amount:Number(tx.amount||0),currency:tx.currency||"KES",phone:tx.phone_number||tx.phone||null,account_reference:tx.external_reference||tx.accountReference||null,mpesa_receipt:tx.mpesa_receipt||null,response_data:tx,updated_at:new Date().toISOString()},{onConflict:"business_id,transaction_id"});
   return reply({transaction:tx});
  }

  if(action==="transactions.list"){
   const query=new URLSearchParams({limit:String(Math.min(100,Math.max(1,Number(body.limit||20))))});
   if(body.status)query.set("status",String(body.status));if(body.type)query.set("type",String(body.type));if(body.cursor)query.set("cursor",String(body.cursor));
   const result=await palRequest(key,"/transactions?"+query.toString());
   if(!result.ok)return reply({error:"Could not list PalPluss transactions."},502);
   return reply({transactions:result.data?.items||[],nextCursor:result.data?.next_cursor||null});
  }
  return reply({error:"Unknown PalPluss action."},404);
 }catch(e){console.error("twiga-palpluss",e);return reply({error:"The PalPluss request could not be completed."},500);}
});