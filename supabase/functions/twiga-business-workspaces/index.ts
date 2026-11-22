import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return json({error:"POST only"},405);
 const auth=req.headers.get("Authorization")||"";if(!auth.startsWith("Bearer "))return json({error:"Sign in required."},401);
 const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!service)return json({error:"TWIGA server is not configured."},503);
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await db.auth.getUser(auth.slice(7).trim());
 if(authError||!authData.user)return json({error:"Session expired. Sign in again."},401);
 const user=authData.user;
 try{
  const body=await req.json().catch(()=>({}));
  if(body.action==="list"){
   const {data,error}=await db.from("business_members").select("business_id,role,businesses(id,name,business_type,status,paid_through,created_at)").eq("user_id",user.id);
   if(error)throw error;
   return json({businesses:(data||[]).map((m:any)=>({id:m.business_id,role:m.role,...(Array.isArray(m.businesses)?m.businesses[0]:m.businesses||{})}))});
  }
  if(body.action==="update_owner_profile"){
   const businessId=String(body.businessId||"");
   const ownerName=String(body.ownerName||"").trim().slice(0,160);
   const ownerEmail=String(body.ownerEmail||"").trim().slice(0,254);
   if(!/^[0-9a-f-]{36}$/i.test(businessId))return json({error:"Select a valid business workspace."},400);
   if(ownerName.length<2||!/^\S+@\S+\.\S+$/.test(ownerEmail))return json({error:"Enter a valid owner name and business contact email."},400);
   const {data:member,error:memberError}=await db.from("business_members").select("role").eq("business_id",businessId).eq("user_id",user.id).maybeSingle();
   if(memberError)throw memberError;
   if(!member||!["owner","admin"].includes(String(member.role)))return json({error:"Only a business owner or administrator can update these details."},403);
   const {error:updateError}=await db.from("twiga_business_profiles").upsert({business_id:businessId,owner_name:ownerName,owner_email:ownerEmail,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:"business_id"});
   if(updateError)throw updateError;
   return json({saved:true,ownerName,ownerEmail});
  }
  if(body.action==="update_operational_settings"){
   const businessId=String(body.businessId||"");
   const settings=body.settings&&typeof body.settings==="object"?body.settings:{};
   if(!/^[0-9a-f-]{36}$/i.test(businessId))return json({error:"Select a valid business workspace."},400);
   const {data:member,error:memberError}=await db.from("business_members").select("role").eq("business_id",businessId).eq("user_id",user.id).maybeSingle();
   if(memberError)throw memberError;
   if(!member||!["owner","admin"].includes(String(member.role)))return json({error:"Only a business owner or administrator can configure owner reports and receptionist prompts."},403);
   const normalizeOwnerPhone=(value:any)=>{
    let phone=String(value||"").trim().replace(/[\s().-]/g,"");
    if(/^0[17]\d{8}$/.test(phone))phone="+254"+phone.slice(1);
    else if(/^254[17]\d{8}$/.test(phone))phone="+"+phone;
    return /^\+[1-9]\d{7,14}$/.test(phone)?phone:"";
   };
   const incomingReport=settings.ownerReportCall&&typeof settings.ownerReportCall==="object"?settings.ownerReportCall:{};
   const enabled=incomingReport.enabled===true;
   const ownerName=String(incomingReport.ownerName||"").trim().slice(0,120);
   const ownerPhone=normalizeOwnerPhone(incomingReport.ownerPhone);
   const nextOwnerName=String(incomingReport.nextOwnerName||"").trim().slice(0,120);
   const nextOwnerPhone=normalizeOwnerPhone(incomingReport.nextOwnerPhone);
   const callTime=String(incomingReport.callTime||"16:30").trim();
   if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(callTime))return json({error:"Set a valid report call time."},400);
   if(enabled&&(Number(callTime.slice(0,2))*60+Number(callTime.slice(3))>18*60+59))return json({error:"Choose a report time no later than 6:59 p.m. so both retries stay inside the allowed calling window."},400);
   if(enabled&&(!ownerName||!ownerPhone||!nextOwnerName||!nextOwnerPhone))return json({error:"Enter the primary owner and next owner names and phone numbers before enabling daily report calls."},400);
   if(enabled&&ownerPhone===nextOwnerPhone)return json({error:"The primary owner and next owner must have different phone numbers."},400);
   const reportSettings={enabled,ownerName,ownerPhone,nextOwnerName,nextOwnerPhone,callTime,timezone:"Africa/Nairobi"};
   const incomingScripts=settings.sautikitScripts&&typeof settings.sautikitScripts==="object"?settings.sautikitScripts:{};
   const scripts={
    greeting:String(incomingScripts.greeting||"Hello, karibu! Thank you for calling {{business_name}}. How can I help you today?").trim().slice(0,1200),
    inbound:String(incomingScripts.inbound||"Answer in the caller's preferred language. Use this business's verified profile, understand the reason for the call, and capture booking or order requests for the team to confirm. Never claim an action is complete unless TWIGA confirms it was saved.").trim().slice(0,5000),
    outbound:String(incomingScripts.outbound||"Only call people when this business has authorised a callback. Identify the business and reason for calling, ask whether it is convenient, keep it brief, and respect requests not to be called again.").trim().slice(0,5000)
   };
   const corePrompt=String(settings.sautikitCorePrompt||"").trim().slice(0,12000);
   const {data:existing,error:existingError}=await db.from("twiga_business_profiles").select("setup_details").eq("business_id",businessId).maybeSingle();
   if(existingError)throw existingError;
   const oldDetails=existing?.setup_details&&typeof existing.setup_details==="object"&&!Array.isArray(existing.setup_details)?existing.setup_details:{};
   const setupDetails={...oldDetails,owner_report_call:reportSettings,sautikit_scripts:scripts,sautikit_core_prompt:corePrompt};
   const {error:saveError}=await db.from("twiga_business_profiles").upsert({business_id:businessId,setup_details:setupDetails,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:"business_id"});
   if(saveError)throw saveError;
   return json({saved:true,ownerReportCall:reportSettings,sautikitScripts:scripts,corePromptSaved:!!corePrompt});
  }

  if(body.action==="create"){
   const name=String(body.name||"").trim().slice(0,120),businessType=String(body.businessType||"general").trim().slice(0,80)||"general",p=body.profile&&typeof body.profile==="object"?body.profile:{};
   if(name.length<2)return json({error:"Add your business name first."},400);
    const {data:b,error:be}=await db.from("businesses").insert({name,business_type:businessType,created_by:user.id}).select("id,name,business_type,status,paid_through,created_at").single();
    if(be||!b)throw be||new Error("Business could not be created.");
    try{
     const id=b.id;
     const {data:existingMember,error:memberReadError}=await db.from("business_members").select("business_id").eq("business_id",id).eq("user_id",user.id).maybeSingle();
     if(memberReadError)throw memberReadError;
     if(!existingMember){const {error:e1}=await db.from("business_members").insert({business_id:id,user_id:user.id,role:"owner"});if(e1)throw e1;}
     const {error:e2}=await db.from("twiga_business_profiles").upsert({
      business_id:id,owner_name:String(p.owner_name||user.user_metadata?.full_name||user.user_metadata?.name||"").trim().slice(0,160),owner_email:String(p.owner_email||user.email||"").trim().slice(0,254),business_summary:String(p.business_summary||"").slice(0,12000),what_they_sell:String(p.what_they_sell||"").slice(0,12000),what_they_do:String(p.what_they_do||"").slice(0,12000),products_and_services:String(p.products_and_services||"").slice(0,16000),target_customers:String(p.target_customers||"").slice(0,8000),unique_selling_points:String(p.unique_selling_points||"").slice(0,8000),service_area:String(p.service_area||"").slice(0,4000),opening_hours:String(p.opening_hours||"").slice(0,4000),delivery_and_payment:String(p.delivery_and_payment||"").slice(0,8000),returns_and_refunds:String(p.returns_and_refunds||"").slice(0,8000),frequently_asked_questions:String(p.frequently_asked_questions||"").slice(0,12000),brand_voice:String(p.brand_voice||"Calm, warm, helpful and professional").slice(0,500),reply_language:String(p.reply_language||"match_customer").slice(0,100),assistant_instructions:String(p.assistant_instructions||"").slice(0,16000),updated_by:user.id
     },{onConflict:"business_id"});if(e2)throw e2;
     const {error:e3}=await db.from("twiga_business_settings").upsert({business_id:id,timezone:String(p.timezone||"Africa/Nairobi"),language_mode:"auto",business_hours:p.business_hours&&typeof p.business_hours==="object"?p.business_hours:{},followups_enabled:true},{onConflict:"business_id"});if(e3)throw e3;
     const {error:e4}=await db.from("twiga_business_voice_configs").upsert({business_id:id,provider:"sautikit",sautikit_agent_id:String(p.sautikit_agent_id||"")||null,sautikit_model_id:String(p.sautikit_model_id||"sautikit-flash"),sautikit_voice_id:String(p.sautikit_voice_id||"Woman"),retell_voice_id:"",retell_model:"",retell_language_codes:["en-KE","sw-KE"],inbound_prompt:String(p.assistant_instructions||"Greet callers warmly, identify what they need, and answer using only this business's verified information. Capture appointment or order requests for staff confirmation.").slice(0,12000),outbound_prompt:"Only call people when the business has authorised the follow-up. Identify the business and respect requests not to be contacted.",updated_by:user.id},{onConflict:"business_id"});if(e4)throw e4;
     const {error:e5a}=await db.from("business_ai").upsert({
      business_id:id,
      greeting:String(p.receptionist_greeting||("Hello, thank you for calling "+name+". How can I help you today?")).slice(0,1200),
      prompt:String(p.assistant_instructions||"").slice(0,16000),
      faq:String(p.frequently_asked_questions||"").slice(0,12000),
      rules:String(p.assistant_instructions||"").slice(0,12000),
      updated_at:new Date().toISOString()
     },{onConflict:"business_id"});if(e5a)throw e5a;
     const {error:e5}=await db.from("twiga_business_workspace_data").upsert({business_id:id,updated_by:user.id,workspace_data:{}},{onConflict:"business_id"});if(e5)throw e5;
    }catch(e){await db.from("businesses").delete().eq("id",b.id);throw e;}
   return json({business:{...b,role:"owner"},created:true});
  }

  if(body.action==="update_profile"){
    const businessId=String(body.businessId||"");
    const p=body.profile&&typeof body.profile==="object"?body.profile:{};
    if(!/^[0-9a-f-]{36}$/i.test(businessId))return json({error:"Select a valid business workspace."},400);
    const {data:member,error:memberError}=await db.from("business_members").select("role").eq("business_id",businessId).eq("user_id",user.id).maybeSingle();
    if(memberError)throw memberError;
    if(!member||!["owner","admin"].includes(String(member.role)))return json({error:"Only a business owner or administrator can save the business profile."},403);
    const name=String(p.business_name||"").trim().slice(0,120);
    const businessType=String(p.business_type||"general").trim().slice(0,80)||"general";
    if(name.length<2)return json({error:"Add a business name before saving the receptionist profile."},400);
    const {error:businessError}=await db.from("businesses").update({name,business_type:businessType}).eq("id",businessId);
    if(businessError)throw businessError;
    const incomingSetupDetails=p.setup_details&&typeof p.setup_details==="object"&&!Array.isArray(p.setup_details)?p.setup_details:{};
    const {data:existingProfile,error:existingProfileError}=await db.from("twiga_business_profiles").select("setup_details").eq("business_id",businessId).maybeSingle();
    if(existingProfileError)throw existingProfileError;
    const existingSetupDetails=existingProfile?.setup_details&&typeof existingProfile.setup_details==="object"&&!Array.isArray(existingProfile.setup_details)?existingProfile.setup_details:{};
    const setupDetails={...existingSetupDetails,...incomingSetupDetails};
    const profileRow={
      business_id:businessId,
      owner_name:String(p.owner_name||user.user_metadata?.full_name||user.user_metadata?.name||"").trim().slice(0,160),
      owner_email:String(p.owner_email||user.email||"").trim().slice(0,254),
      business_summary:String(p.business_summary||"").slice(0,12000),
      what_they_sell:String(p.what_they_sell||"").slice(0,12000),
      what_they_do:String(p.what_they_do||"").slice(0,12000),
      products_and_services:String(p.products_and_services||"").slice(0,16000),
      target_customers:String(p.target_customers||"").slice(0,8000),
      unique_selling_points:String(p.unique_selling_points||"").slice(0,8000),
      service_area:String(p.service_area||"").slice(0,4000),
      opening_hours:String(p.opening_hours||"").slice(0,4000),
      delivery_and_payment:String(p.delivery_and_payment||"").slice(0,8000),
      returns_and_refunds:String(p.returns_and_refunds||"").slice(0,8000),
      frequently_asked_questions:String(p.frequently_asked_questions||"").slice(0,12000),
      brand_voice:String(p.brand_voice||"Warm, clear, helpful and professional").slice(0,500),
      reply_language:String(p.reply_language||"match_customer").slice(0,100),
      assistant_instructions:String(p.assistant_instructions||"").slice(0,16000),
      setup_details:setupDetails,
      updated_by:user.id,
      updated_at:new Date().toISOString()
    };
    const {error:profileError}=await db.from("twiga_business_profiles").upsert(profileRow,{onConflict:"business_id"});
    if(profileError)throw profileError;
    const businessHours=setupDetails.business_hours&&typeof setupDetails.business_hours==="object"?setupDetails.business_hours:{};
    const {error:settingsError}=await db.from("twiga_business_settings").upsert({
      business_id:businessId,
      timezone:String(setupDetails.timezone||"Africa/Nairobi"),
      language_mode:"auto",
      business_hours:businessHours,
      followups_enabled:true
    },{onConflict:"business_id"});
    if(settingsError)throw settingsError;
    const {data:oldVoice,error:voiceReadError}=await db.from("twiga_business_voice_configs").select("*").eq("business_id",businessId).maybeSingle();
    if(voiceReadError)throw voiceReadError;
    const greeting=String(p.receptionist_greeting||("Hello, thank you for contacting "+name+". How can I help you today?")).slice(0,1200);
    const instructions=String(p.assistant_instructions||"Greet customers warmly, use verified business information, and pass requests needing confirmation to the business team.").slice(0,12000);
    const {error:voiceError}=await db.from("twiga_business_voice_configs").upsert({
      ...(oldVoice||{}),
      business_id:businessId,
      provider:oldVoice?.provider||"sautikit",
      sautikit_agent_id:oldVoice?.sautikit_agent_id||null,
      sautikit_model_id:oldVoice?.sautikit_model_id||"sautikit-flash",
      sautikit_voice_id:oldVoice?.sautikit_voice_id||"Woman",
      inbound_prompt:instructions,
      outbound_prompt:oldVoice?.outbound_prompt||"Only call people when the business has authorised the follow-up.",
      updated_by:user.id
    },{onConflict:"business_id"});
    if(voiceError)throw voiceError;
    const {error:aiError}=await db.from("business_ai").upsert({
      business_id:businessId,
      greeting,
      prompt:instructions,
      faq:String(p.frequently_asked_questions||"").slice(0,12000),
      rules:instructions,
      updated_at:new Date().toISOString()
    },{onConflict:"business_id"});
    if(aiError)throw aiError;
    return json({saved:true,business:{id:businessId,name,business_type:businessType},profile:profileRow});
  }

  return json({error:"Unknown workspace action."},404);
 }catch(e){console.error("twiga-business-workspaces",e);return json({error:e instanceof Error?e.message:"Could not complete workspace action."},500);}
});
