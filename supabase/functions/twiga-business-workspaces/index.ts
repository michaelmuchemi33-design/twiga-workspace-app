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
  return json({error:"Unknown workspace action."},404);
 }catch(e){console.error("twiga-business-workspaces",e);return json({error:e instanceof Error?e.message:"Could not complete workspace action."},500);}
});
