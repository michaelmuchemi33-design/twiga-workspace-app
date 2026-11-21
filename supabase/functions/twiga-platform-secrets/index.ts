import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
 if(req.method!=="POST") return json({error:"POST only"},405);
 const auth=req.headers.get("Authorization")||""; if(!auth.startsWith("Bearer ")) return json({error:"Sign in required."},401);
 const url=Deno.env.get("SUPABASE_URL")||"",service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!service) return json({error:"TWIGA server is not configured."},503);
 const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await admin.auth.getUser(auth.slice(7).trim());
 if(authError||!authData.user) return json({error:"Session expired. Sign in again."},401);
 const user=authData.user;
 const {data:adminRow}=await admin.from("twiga_platform_admins").select("user_id").eq("user_id",user.id).maybeSingle();
 if(!adminRow) return json({isAdmin:false,error:"Platform administrator access required."},403);
 try{
  const body=await req.json().catch(()=>({})),action=String(body.action||"get_config");
  if(action==="business.providers.status"){
   const businessId=String(body.businessId||"");
   if(!/^[0-9a-f-]{36}$/i.test(businessId)) return json({error:"Choose a valid business workspace."},400);
   const {data:refs,error}=await admin.from("twiga_provider_secret_refs").select("provider,secret_last4,updated_at").eq("business_id",businessId).order("provider",{ascending:true});
   if(error) throw error;
   return json({isAdmin:true,businessId,providers:refs||[]});
  }
  if(action==="business.provider.save"){
   const businessId=String(body.businessId||"");
   const provider=String(body.provider||"");
   const secret=String(body.secret||"").trim();
   const allowed=["sautikit","palpluss","aisensy_project_api_key","aisensy_campaign_api_key","waha_r2_bucket","waha_r2_access_key_id","waha_r2_secret_access_key"];
   if(!/^[0-9a-f-]{36}$/i.test(businessId)) return json({error:"Choose a valid business workspace."},400);
   if(!allowed.includes(provider)) return json({error:"That provider field is not assignable."},400);
   if(secret.length<3||secret.length>4000) return json({error:"Enter a valid provider value."},400);
   if(provider==="waha_r2_bucket"&&!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(secret)) return json({error:"R2 bucket names must use lowercase letters, numbers and hyphens."},400);
   if(provider!=="waha_r2_bucket"&&secret.length<16) return json({error:"This provider credential is too short."},400);
   const {data:last4,error}=await admin.rpc("twiga_set_provider_secret",{p_business_id:businessId,p_provider:provider,p_secret:secret,p_updated_by:user.id});
   if(error){console.error("Business provider assignment failed",provider,error.message);return json({error:"The provider credential could not be stored in encrypted Vault. Check the provider type and business assignment."},500);}
   await admin.from("twiga_admin_audit_logs").insert({admin_email:user.email||"unknown",action:"provider.business.assign",resource_type:"business",resource_id:businessId,metadata:{provider:provider,secret_last4:last4}});
   return json({isAdmin:true,saved:true,businessId,provider,last4:last4,message:"Provider setting securely assigned to this business. The value will never be shown again."});
  }
  if(action==="waha.platform.status"){
   const {data:ref,error}=await admin.from("twiga_platform_secret_refs").select("secret_last4,updated_at").eq("provider","waha_internal_api_key").maybeSingle();
   if(error) throw error;
   return json({isAdmin:true,keyConfigured:!!ref,keyLast4:ref?.secret_last4||"",updatedAt:ref?.updated_at||null});
  }
  if(action==="waha.platform.save"){
   const apiKey=String(body.apiKey||"").trim();
   if(apiKey.length<24||apiKey.length>400) return json({error:"Enter a WAHA internal API key with at least 24 characters."},400);
   const {data:last4,error}=await admin.rpc("twiga_set_platform_secret",{p_provider:"waha_internal_api_key",p_secret:apiKey,p_updated_by:user.id});
   if(error){console.error("WAHA platform key save failed",error.message);return json({error:"WAHA service key could not be stored in encrypted Supabase Vault."},500);}
   return json({isAdmin:true,keyConfigured:true,keyLast4:last4,message:"WAHA service key saved in encrypted Vault. It is sent only to private TWIGA WAHA containers."});
  }
  if(action==="get_config"){
   const {data:ref}=await admin.from("twiga_platform_secret_refs").select("secret_last4,updated_at").eq("provider","xai").maybeSingle();
   return json({isAdmin:true,keyConfigured:!!ref||!!Deno.env.get("XAI_API_KEY"),keySource:ref?"vault":Deno.env.get("XAI_API_KEY")?"environment":"missing",keyLast4:ref?.secret_last4||"",updatedAt:ref?.updated_at||null});
  }
  if(action==="retell.platform.status"){
   const {data:ref,error:refError}=await admin.from("twiga_platform_secret_refs").select("secret_last4,updated_at").eq("provider","retell_platform_api_key").maybeSingle();
   if(refError) throw refError;
   return json({isAdmin:true,keyConfigured:!!ref,keyLast4:ref?.secret_last4||"",updatedAt:ref?.updated_at||null,testAgentId:"agent_709032871a53a47128620a1099"});
  }
  if(action==="retell.platform.save"){
   const apiKey=String(body.apiKey||"").trim();
   if(apiKey.length<20||apiKey.length>500) return json({error:"Enter a valid Retell API key."},400);
   const testAgentId="agent_709032871a53a47128620a1099";
   const check=await fetch("https://api.retellai.com/v2/get-agent/"+encodeURIComponent(testAgentId),{headers:{Authorization:"Bearer "+apiKey}});
   if(!check.ok) return json({error:check.status===401?"Retell rejected this API key. Use a key from the same Retell workspace as the TWIGA demo agent.":"The key could not access the TWIGA demo agent (HTTP "+check.status+")."},400);
   const agent=await check.json().catch(()=>({}));
   if(String(agent.agent_id||"")!==testAgentId) return json({error:"The Retell API key did not return the TWIGA demo agent."},400);
   const {data:last4,error:saveError}=await admin.rpc("twiga_set_platform_secret",{p_provider:"retell_platform_api_key",p_secret:apiKey,p_updated_by:user.id});
   if(saveError){console.error("Platform Retell key save failed",saveError.message);return json({error:"Retell key validated but could not be stored in Supabase Vault."},500);}
   return json({isAdmin:true,keyConfigured:true,keyLast4:last4,testAgentId,message:"Retell API key validated against the TWIGA demo agent and saved in encrypted Supabase Vault. Businesses can use this platform connection while keeping separate agent IDs."});
  }
  if(action==="palpluss.platform.status"){
   const {data:ref,error:refError}=await admin.from("twiga_platform_secret_refs").select("secret_last4,updated_at").eq("provider","palpluss_platform_api_key").maybeSingle();
   if(refError) throw refError;
   return json({isAdmin:true,keyConfigured:!!ref,keyLast4:ref?.secret_last4||"",updatedAt:ref?.updated_at||null});
  }
  if(action==="palpluss.platform.save"){
   const apiKey=String(body.apiKey||"").trim();
   if(apiKey.length<20||apiKey.length>500) return json({error:"Enter a valid PalPluss API key."},400);
   const check=await fetch("https://api.palpluss.com/v1/wallets/service/balance",{headers:{Authorization:"Basic "+btoa(apiKey+":"),Accept:"application/json"}});
   if(!check.ok) return json({error:check.status===401?"PalPluss rejected this API key. Check it and try again.":"Could not validate the PalPluss platform account."},400);
   const {data:last4,error}=await admin.rpc("twiga_set_platform_secret",{p_provider:"palpluss_platform_api_key",p_secret:apiKey,p_updated_by:user.id});
   if(error){console.error("PalPluss platform key save failed",error.message);return json({error:"PalPluss key validated but could not be stored in encrypted Vault."},500);}
   return json({isAdmin:true,keyConfigured:true,keyLast4:last4,message:"Central PalPluss API key validated and saved in encrypted Vault. Each business can now register its own Till or Paybill."});
  }
  if(action==="google.oauth.status"){
   const {data:refs,error:refsError}=await admin.from("twiga_platform_secret_refs").select("provider,secret_last4,updated_at").in("provider",["google_oauth_client_id","google_oauth_client_secret","google_token_encryption_key"]);
   if(refsError) throw refsError;
   const rows=Array.isArray(refs)?refs:[];
   const idRef=rows.find((x:any)=>x.provider==="google_oauth_client_id");
   const secretRef=rows.find((x:any)=>x.provider==="google_oauth_client_secret");
   const encryptionRef=rows.find((x:any)=>x.provider==="google_token_encryption_key");
   const {data:clientId}=await admin.rpc("twiga_get_platform_secret",{p_provider:"google_oauth_client_id"});
   const envClientId=String(Deno.env.get("GOOGLE_CLIENT_ID")||"");
   const envClientSecret=String(Deno.env.get("GOOGLE_CLIENT_SECRET")||"");
   const envEncryptionKey=String(Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY")||"");
   return json({isAdmin:true,clientId:String(clientId||envClientId),clientIdConfigured:!!(idRef||envClientId),clientSecretConfigured:!!(secretRef||envClientSecret),encryptionReady:!!(encryptionRef||envEncryptionKey),clientIdSource:idRef?"vault":envClientId?"supabase_environment":"missing",clientSecretSource:secretRef?"vault":envClientSecret?"supabase_environment":"missing",clientIdLast4:idRef?.secret_last4||"",clientSecretLast4:secretRef?.secret_last4||"",updatedAt:secretRef?.updated_at||idRef?.updated_at||null});
  }
  if(action==="google.oauth.save"){
   const clientId=String(body.clientId||"").trim();
   const clientSecret=String(body.clientSecret||"").trim();
   if(!clientId.endsWith(".apps.googleusercontent.com")||clientId.length<40||clientId.length>200) return json({error:"Enter a valid Google OAuth web client ID."},400);
   if(clientSecret.length<20||clientSecret.length>500) return json({error:"Enter the newly rotated Google OAuth client secret."},400);
   const {error:idError}=await admin.rpc("twiga_set_platform_secret",{p_provider:"google_oauth_client_id",p_secret:clientId,p_updated_by:user.id});
   if(idError){console.error("Google OAuth client ID save failed",idError.message);return json({error:"Could not store the Google OAuth client ID in Vault."},500);}
   const {data:last4,error:secretError}=await admin.rpc("twiga_set_platform_secret",{p_provider:"google_oauth_client_secret",p_secret:clientSecret,p_updated_by:user.id});
   if(secretError){console.error("Google OAuth client secret save failed",secretError.message);return json({error:"Client ID saved, but the Google OAuth client secret could not be stored."},500);}
   return json({isAdmin:true,clientIdConfigured:true,clientSecretConfigured:true,message:"Google OAuth credentials saved in encrypted Supabase Vault. Business owners will authorize their own Google accounts.",clientSecretLast4:last4});
  }
  if(action==="save_xai_key"){
   const apiKey=String(body.apiKey||"").trim(); if(apiKey.length<20||apiKey.length>500) return json({error:"Enter a valid xAI API key."},400);
   const check=await fetch("https://api.x.ai/v1/models",{headers:{Authorization:"Bearer "+apiKey,Accept:"application/json"}});
   if(!check.ok) return json({error:check.status===401?"xAI rejected this API key. Check it and try again.":"Could not validate the xAI key or account."},400);
   const {data:last4,error}=await admin.rpc("twiga_set_platform_secret",{p_provider:"xai",p_secret:apiKey,p_updated_by:user.id});
   if(error){console.error("xAI Vault save failed",error.message);return json({error:"Key validated but could not be stored in Vault."},500);}
   return json({isAdmin:true,keyConfigured:true,keyLast4:last4,message:"Grok setup key validated and saved in encrypted Supabase Vault."});
  }
  return json({error:"Unknown platform secret action."},404);
 }catch(e){console.error("twiga-platform-secrets",e);return json({error:"Platform secret operation failed."},500);}
});