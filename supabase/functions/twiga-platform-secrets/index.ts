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
  if(action==="get_config"){
   const {data:ref}=await admin.from("twiga_platform_secret_refs").select("secret_last4,updated_at").eq("provider","openrouter").maybeSingle();
   return json({isAdmin:true,keyConfigured:!!ref||!!Deno.env.get("OPENROUTER_API_KEY"),keySource:ref?"vault":Deno.env.get("OPENROUTER_API_KEY")?"environment":"missing",keyLast4:ref?.secret_last4||"",updatedAt:ref?.updated_at||null});
  }
  if(action==="sautikit.platform.status"){
   const {data:ref,error:refError}=await admin.from("twiga_platform_secret_refs").select("secret_last4,updated_at").eq("provider","sautikit_platform_api_key").maybeSingle();
   if(refError) throw refError;
   return json({isAdmin:true,keyConfigured:!!ref,keyLast4:ref?.secret_last4||"",updatedAt:ref?.updated_at||null});
  }
  if(action==="sautikit.platform.save"){
   const apiKey=String(body.apiKey||"").trim();
   if(apiKey.length<20||apiKey.length>4000)return json({error:"Enter a valid SautiKit workspace API key."},400);
   const headers={Authorization:"Bearer "+apiKey,Accept:"application/json"};
   const [modelsResponse,numbersResponse]=await Promise.all([fetch("https://api.sautikit.com/v1/models",{headers}),fetch("https://api.sautikit.com/v1/numbers",{headers})]);
   const modelsPayload=await modelsResponse.json().catch(()=>({}));
   const numbersPayload=await numbersResponse.json().catch(()=>({}));
   if(!modelsResponse.ok||!numbersResponse.ok){
    const status=!modelsResponse.ok?modelsResponse.status:numbersResponse.status;
    return json({error:status===401||status===403?"SautiKit rejected this workspace API key. Use a key from the workspace that owns the TWIGA phone-number pool.":"SautiKit could not validate the workspace API key (HTTP "+status+")."},400);
   }
   const models=Array.isArray(modelsPayload?.data)?modelsPayload.data:[];
   const numbers=Array.isArray(numbersPayload?.data)?numbersPayload.data:[];
   if(!models.length)return json({error:"The key authenticated, but SautiKit returned no voice models. Check that this is a workspace API key with model access."},409);
   const {data:last4,error:saveError}=await admin.rpc("twiga_set_platform_secret",{p_provider:"sautikit_platform_api_key",p_secret:apiKey,p_updated_by:user.id});
   if(saveError){console.error("Platform SautiKit Vault save failed",saveError.message);return json({error:"SautiKit validated the key but TWIGA could not store it in encrypted Vault."},500);}
   const activeNumbers=numbers.filter((n:any)=>String(n.status||"").toLowerCase()==="active").length;
   return json({isAdmin:true,keyConfigured:true,keyLast4:last4,modelsCount:models.length,numberCount:numbers.length,activeNumberCount:activeNumbers,message:"Shared SautiKit workspace key validated and saved in encrypted Supabase Vault. TWIGA can now allocate numbers from this pool and create separate receptionist agents for each business."});
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
   const apiKeyInput=String(body.apiKey||"").trim();
   const basicInput=String(body.basicAuthorization||body.base64Authorization||"").trim();
   if(apiKeyInput&&basicInput)return json({error:"Enter either the PalPluss API key or the Base64 Basic Authorization value, not both."},400);
   let apiKey=apiKeyInput;
   if(basicInput){
    const encoded=basicInput.replace(/^Basic\s+/i,"").replace(/\s+/g,"");
    try{
     const decoded=atob(encoded);
     if(!decoded.endsWith(":"))return json({error:"The Base64 value must decode to API_KEY: (an empty password). This is not a separate Safaricom Daraja OAuth token."},400);
     apiKey=decoded.slice(0,-1);
    }catch{return json({error:"The Base64 Basic Authorization value is invalid."},400);}
   }
   if(apiKey.length<20||apiKey.length>500)return json({error:"Enter a valid PalPluss API key or Base64 Basic Authorization value."},400);
   const check=await fetch("https://api.palpluss.com/v1/wallets/service/balance",{headers:{Authorization:"Basic "+btoa(apiKey+":"),Accept:"application/json"}});
   if(!check.ok)return json({error:check.status===401?"PalPluss rejected this credential. Check the API key or Base64 value and try again.":"Could not validate the PalPluss platform account."},400);
   const {data:last4,error}=await admin.rpc("twiga_set_platform_secret",{p_provider:"palpluss_platform_api_key",p_secret:apiKey,p_updated_by:user.id});
   if(error){console.error("PalPluss platform key save failed",error.message);return json({error:"PalPluss credential validated but could not be stored in encrypted Vault."},500);}
   return json({isAdmin:true,keyConfigured:true,keyLast4:last4,message:"Central PalPluss credential validated and saved in encrypted Vault. TWIGA stores the API key only and creates the Basic header server-side. Each business can now register its own Till or Paybill."});
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
  if(action==="aisensy.platform.status"){
   const providers=["aisensy_campaign_api_key","aisensy_project_api_key","aisensy_project_id"];
   const {data:refs,error:refError}=await admin.from("twiga_platform_secret_refs")
     .select("provider,secret_last4,updated_at").in("provider",providers);
   if(refError)throw refError;
   const map=new Map((refs||[]).map((x:any)=>[String(x.provider),x]));
   return json({
     isAdmin:true,
     campaignKeyConfigured:map.has("aisensy_campaign_api_key"),
     campaignKeyLast4:map.get("aisensy_campaign_api_key")?.secret_last4||"",
     projectKeyConfigured:map.has("aisensy_project_api_key"),
     projectKeyLast4:map.get("aisensy_project_api_key")?.secret_last4||"",
     projectIdConfigured:map.has("aisensy_project_id"),
     updatedAt:refs?.map((x:any)=>x.updated_at).sort().at(-1)||null,
     validation:"saved_not_tested"
   });
  }
  if(action==="aisensy.platform.save"){
   const campaignApiKey=String(body.campaignApiKey||"").trim();
   const projectApiKey=String(body.projectApiKey||"").trim();
   const projectId=String(body.projectId||"").trim();
   if(!campaignApiKey&&!projectApiKey&&!projectId)return json({error:"Enter at least one rotated AiSensy credential."},400);
   if(campaignApiKey&&(campaignApiKey.length<20||campaignApiKey.length>4000))return json({error:"Campaign API key is too short or too long."},400);
   if(projectApiKey&&(projectApiKey.length<20||projectApiKey.length>4000))return json({error:"Project API key is too short or too long."},400);
   if(!!projectApiKey!==!!projectId)return json({error:"Project API key and Project ID must be saved together."},400);
   if(projectId&&(!/^[A-Za-z0-9_-]{4,120}$/.test(projectId)))return json({error:"Check the AiSensy Project ID format."},400);
   const saved:Record<string,string>={};
   if(campaignApiKey){
     const {data:last4,error}=await admin.rpc("twiga_set_platform_secret",{p_provider:"aisensy_campaign_api_key",p_secret:campaignApiKey,p_updated_by:user.id});
     if(error)throw new Error("Could not securely store the AiSensy campaign key.");
     saved.campaignKeyLast4=String(last4||"");
   }
   if(projectApiKey&&projectId){
     const [projectResult,idResult]=await Promise.all([
       admin.rpc("twiga_set_platform_secret",{p_provider:"aisensy_project_api_key",p_secret:projectApiKey,p_updated_by:user.id}),
       admin.rpc("twiga_set_platform_secret",{p_provider:"aisensy_project_id",p_secret:projectId,p_updated_by:user.id})
     ]);
     if(projectResult.error||idResult.error)throw new Error("Could not securely store the AiSensy project credentials.");
     saved.projectKeyLast4=String(projectResult.data||"");
   }
   return json({
     isAdmin:true,
     campaignKeyConfigured:!!campaignApiKey,
     projectKeyConfigured:!!projectApiKey,
     projectIdConfigured:!!projectId,
     ...saved,
     validation:"saved_not_tested",
     message:"AiSensy credentials saved in encrypted Vault. They have not been tested by sending a WhatsApp message. Configure a live API campaign and an approved template before sending."
   });
  }
  if(action==="telerivet.platform.status"){
   const {data:ref,error}=await admin.from("twiga_platform_secret_refs").select("secret_last4,updated_at").eq("provider","telerivet_platform_api_key").maybeSingle();
   if(error)throw error;
   return json({isAdmin:true,keyConfigured:!!ref,keyLast4:ref?.secret_last4||"",updatedAt:ref?.updated_at||null});
  }
  if(action==="telerivet.platform.save"){
   const apiKey=String(body.apiKey||"").trim();
   if(apiKey.length<20||apiKey.length>4000)return json({error:"Enter a valid Telerivet API key."},400);
   const check=await fetch("https://api.telerivet.com/v1/projects",{headers:{Authorization:"Basic "+btoa(apiKey+":"),Accept:"application/json"},signal:AbortSignal.timeout(15000)});
   if(!check.ok)return json({error:check.status===401||check.status===403?"Telerivet rejected this API key. Check the API client permissions.":"Could not validate Telerivet API access (HTTP "+check.status+")."},400);
   const {data:last4,error}=await admin.rpc("twiga_set_platform_secret",{p_provider:"telerivet_platform_api_key",p_secret:apiKey,p_updated_by:user.id});
   if(error)throw new Error("Telerivet key validated but could not be saved in encrypted Vault.");
   return json({isAdmin:true,keyConfigured:true,keyLast4:last4,message:"Telerivet API key validated and stored in encrypted Vault. Assign a separate Telerivet Project ID to each business before enabling its SMS sending."});
  }
  if(action==="telerivet.business.assign"){
   const businessId=String(body.businessId||"").trim();
   const projectId=String(body.projectId||"").trim();
   if(!/^[0-9a-f-]{36}$/i.test(businessId))return json({error:"Choose a valid business workspace."},400);
   if(!/^[A-Za-z0-9_-]{4,100}$/.test(projectId))return json({error:"Enter the Telerivet Project ID for this business."},400);
   const {data:key,error:keyError}=await admin.rpc("twiga_get_platform_secret",{p_provider:"telerivet_platform_api_key"});
   if(keyError)throw keyError;
   if(!key)return json({error:"Connect the central Telerivet API key first."},409);
   const check=await fetch("https://api.telerivet.com/v1/projects/"+encodeURIComponent(projectId),{headers:{Authorization:"Basic "+btoa(String(key)+":"),Accept:"application/json"},signal:AbortSignal.timeout(15000)});
   if(!check.ok)return json({error:check.status===404?"That Telerivet project was not found or is not accessible with this API key.":"Could not verify this Telerivet project (HTTP "+check.status+")."},400);
   const {data:last4,error:saveError}=await admin.rpc("twiga_set_business_provider_secret",{p_business_id:businessId,p_provider:"telerivet_project_id",p_secret:projectId,p_updated_by:user.id});
   if(saveError)throw new Error("Telerivet project verified but could not be saved to this business's encrypted provider settings.");
   await admin.from("twiga_admin_audit_logs").insert({admin_email:user.email||"unknown",action:"telerivet.project.assigned",resource_type:"business",resource_id:businessId,metadata:{project_id_last4:last4}});
   return json({isAdmin:true,assigned:true,projectLast4:last4,message:"Telerivet project verified and assigned to this business only."});
  }
  if(action==="telerivet.business.status"){
   const businessId=String(body.businessId||"").trim();
   if(!/^[0-9a-f-]{36}$/i.test(businessId))return json({error:"Choose a valid business workspace."},400);
   const {data:ref,error}=await admin.from("twiga_business_provider_secret_refs").select("secret_last4,updated_at").eq("business_id",businessId).eq("provider","telerivet_project_id").maybeSingle();
   if(error)throw error;
   return json({isAdmin:true,projectConfigured:!!ref,projectLast4:ref?.secret_last4||"",updatedAt:ref?.updated_at||null});
  }
  if(action==="save_openrouter_key"){
   const apiKey=String(body.apiKey||"").trim(); if(apiKey.length<20||apiKey.length>500) return json({error:"Enter a valid OpenRouter API key."},400);
   const check=await fetch("https://openrouter.ai/api/v1/models",{headers:{Authorization:"Bearer "+apiKey,Accept:"application/json"}});
   if(!check.ok) return json({error:check.status===401?"OpenRouter rejected this API key. Check it and try again.":"Could not validate the OpenRouter key or account."},400);
   const {data:last4,error}=await admin.rpc("twiga_set_platform_secret",{p_provider:"openrouter",p_secret:apiKey,p_updated_by:user.id});
   if(error){console.error("OpenRouter Vault save failed",error.message);return json({error:"Key validated but could not be stored in Vault."},500);}
   return json({isAdmin:true,keyConfigured:true,keyLast4:last4,message:"OpenRouter setup key validated and saved in encrypted Supabase Vault."});
  }
  return json({error:"Unknown platform secret action."},404);
 }catch(e){console.error("twiga-platform-secrets",e);return json({error:"Platform secret operation failed."},500);}
});