import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const sha256=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,"0")).join("");
function constantTimeEqual(a:string,b:string){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST only"},405);
 const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!service)return json({error:"Server not configured."},503);
 try{
  const parsed=new URL(req.url),businessId=parsed.searchParams.get("business_id")||"",token=parsed.searchParams.get("token")||"";
  if(!businessId||!token)return json({error:"Missing webhook authentication."},401);
  const body=await req.json().catch(()=>null);
  const tx=body?.transaction||body?.data?.transaction||body?.data||body;
  const txId=String(tx?.id||tx?.transaction_id||"");
  if(!txId)return json({error:"Transaction ID missing."},400);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:existing,error}=await db.from("twiga_palpluss_transactions").select("webhook_token_hash").eq("business_id",businessId).eq("transaction_id",txId).maybeSingle();
  if(error||!existing?.webhook_token_hash)return json({error:"Transaction not found."},404);
  if(!constantTimeEqual(await sha256(token),String(existing.webhook_token_hash)))return json({error:"Invalid webhook token."},401);
  const event=String(body?.event_type||body?.event||"").toLowerCase();
  const status=String(tx.status|| (event.includes("success")?"SUCCESS":event.includes("fail")?"FAILED":event.includes("cancel")?"CANCELLED":event.includes("reverse")?"REVERSED":"PENDING")).toUpperCase();
  const accountReference=String(tx.external_reference||tx.account_reference||tx.accountReference||"").slice(0,120);
  const {error:updateError}=await db.from("twiga_palpluss_transactions").update({
   status,amount:Number(tx.amount||0),currency:String(tx.currency||"KES"),
   phone:tx.phone_number||tx.phone||null,
   account_reference:accountReference||null,
   transaction_desc:tx.description||tx.transaction_desc||null,
   mpesa_receipt:tx.mpesa_receipt||tx.receipt_number||null,
   provider_request_id:tx.provider_request_id||null,
   provider_checkout_id:tx.provider_checkout_id||null,
   response_data:body,updated_at:new Date().toISOString()
  }).eq("business_id",businessId).eq("transaction_id",txId);
  if(updateError){console.error("PalPluss webhook update failed",updateError.message);return json({error:"Could not update transaction."},500);}

  let orderUpdated=false, smsStatus="not_sent";
  if(status==="SUCCESS" && accountReference){
   const {data:order, error:orderLookupError}=await db.from("twiga_orders")
    .select("id,order_number,customer_name,customer_phone,total_amount,customer_sms_consent")
    .eq("business_id",businessId).eq("order_number",accountReference).maybeSingle();
   if(orderLookupError)console.error("Could not match successful PalPluss payment to order",orderLookupError.message);
   if(order){
    const {error:orderUpdateError}=await db.from("twiga_orders").update({payment_status:"paid",payment_method:"MPESA_STK"})
     .eq("business_id",businessId).eq("id",order.id);
    if(orderUpdateError)console.error("Could not mark TWIGA order paid",orderUpdateError.message);
    else orderUpdated=true;

    if(orderUpdated && order.customer_sms_consent===true){
     try{
      const {data:smsSettings}=await db.from("twiga_sms_settings").select("sender_name,payment_confirmation_enabled").eq("business_id",businessId).maybeSingle();
      if(smsSettings?.payment_confirmation_enabled===true && smsSettings.sender_name && order.customer_phone){
       const {data:keyData,error:keyError}=await db.rpc("twiga_get_provider_secret",{p_business_id:businessId,p_provider:"kimisms"});
       if(keyError||!keyData)throw new Error("Business KIMISMS credentials are not connected.");
       const creds=JSON.parse(String(keyData));
       const recipient=String(order.customer_phone).replace(/[\\s().-]/g,"").replace(/^\\+/, "");
       if(!/^254[17]\\d{8}$/.test(recipient))throw new Error("Order phone number is not a valid Kenyan mobile number.");
       const idempotencyKey=order.id+":payment_confirmation";
       const {data:existingSms}=await db.from("twiga_sms_messages").select("id,status").eq("business_id",businessId).eq("idempotency_key",idempotencyKey).maybeSingle();
       if(existingSms && ["queued","pending","sent","delivered"].includes(String(existingSms.status))){
        smsStatus="already_submitted";
       }else{
        if(!existingSms){
         const {error:smsInsertError}=await db.from("twiga_sms_messages").insert({
          business_id:businessId,order_id:order.id,event_type:"payment_confirmation",recipient,
          message:"Payment received by TWIGA business. Order "+String(order.order_number||order.id.slice(0,8))+" · KSh "+Number(order.total_amount||0).toLocaleString("en-KE")+". Thank you.",
          provider:"kimisms",idempotency_key:idempotencyKey,status:"queued",metadata:{source:"palpluss_webhook"}
         });
         if(smsInsertError)throw smsInsertError;
        }
        const tokenResponse=await fetch("https://app.kimisms.com/api/generate-token",{
         method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},
         body:JSON.stringify({grant_type:"client_credentials",client_id:creds.client_id,client_secret:creds.client_secret}),
         signal:AbortSignal.timeout(12000)
        });
        const tokenBody=await tokenResponse.json().catch(()=>({}));
        if(!tokenResponse.ok||!tokenBody.access_token)throw new Error("KIMISMS could not issue a bearer token.");
        const smsText="Payment received by "+String(order.customer_name||"the business").slice(0,60)+". Order "+String(order.order_number||order.id.slice(0,8))+" · KSh "+Number(order.total_amount||0).toLocaleString("en-KE")+". Thank you.";
        const smsResponse=await fetch("https://app.kimisms.com/api/send-sms",{
         method:"POST",
         headers:{Authorization:"Bearer "+tokenBody.access_token,"Content-Type":"application/json",Accept:"application/json","Idempotency-Key":idempotencyKey},
         body:JSON.stringify({sender_name:smsSettings.sender_name,contact:recipient,message:smsText}),
         signal:AbortSignal.timeout(15000)
        });
        const smsBody=await smsResponse.json().catch(()=>({}));
        if(!smsResponse.ok)throw new Error("KIMISMS rejected the payment SMS.");
        const providerId=String(smsBody.message_id||smsBody.data?.message_id||smsBody.id||"");
        await db.from("twiga_sms_messages").update({
         provider_message_id:providerId||null,status:"pending",error_message:null,metadata:{source:"palpluss_webhook",provider_response:smsBody},updated_at:new Date().toISOString()
        }).eq("business_id",businessId).eq("idempotency_key",idempotencyKey);
        smsStatus="pending";
       }
      }
     }catch(smsError){
      smsStatus="failed";
      console.error("Payment SMS failed (payment remains confirmed)",smsError instanceof Error?smsError.message:"unknown");
     }
    }
   }
  }
  return json({received:true,transactionId:txId,status,orderUpdated,smsStatus});
 }catch(e){console.error("twiga-palpluss-webhook",e);return json({error:"Webhook could not be processed."},500);}
});