const QUOTA=524288000;
const ALLOWED=new Set(["https://live.twiga.co.ke","https://app.twiga.co.ke","capacitor://localhost"]);
const cors=req=>{const origin=req.headers.get("Origin")||"";return {"Access-Control-Allow-Origin":ALLOWED.has(origin)?origin:"https://live.twiga.co.ke","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type, X-Twiga-Upload-Token","Access-Control-Max-Age":"86400","Vary":"Origin","Cache-Control":"no-store"};};
const reply=(req,body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),"Content-Type":"application/json"}});
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("");
async function reserve(env,biz,bytes){if(bytes<=0)return;const row=await env.DB.prepare("INSERT INTO usage (business_id, bytes_used) VALUES (?, ?) ON CONFLICT(business_id) DO UPDATE SET bytes_used=usage.bytes_used+excluded.bytes_used WHERE usage.bytes_used+excluded.bytes_used<=? RETURNING bytes_used").bind(biz,bytes,QUOTA).first();if(!row)throw new Error("STORAGE_QUOTA");}
async function release(env,biz,bytes){if(bytes>0)await env.DB.prepare("UPDATE usage SET bytes_used=MAX(0,bytes_used-?) WHERE business_id=?").bind(bytes,biz).run();}
export default {async fetch(request,env){
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors(request)});
 const parts=new URL(request.url).pathname.split("/").filter(Boolean);
 if(request.method==="GET"&&parts.length===1&&parts[0]==="health")return reply(request,{ok:true,service:"twiga-recording-gateway",quotaBytes:QUOTA});
 if(request.method!=="POST"||parts.length!==3||parts[0]!=="internal"||parts[1]!=="recordings"||!/^[A-Za-z0-9_-]{8,100}$/.test(parts[2]))return reply(request,{error:"Not found"},404);
 const callId=parts[2],token=String(request.headers.get("x-twiga-upload-token")||"");
 if(!token||token.length<32||token.length>128)return reply(request,{error:"Upload token required"},401);
 const contentType=(request.headers.get("content-type")||"application/octet-stream").split(";")[0].toLowerCase();
 if(!["audio/wav","audio/mpeg","audio/mp4","audio/ogg","audio/webm","application/octet-stream"].includes(contentType))return reply(request,{error:"Unsupported recording media type"},415);
 const bytes=await request.arrayBuffer();
 if(bytes.byteLength===0||bytes.byteLength>50*1024*1024)return reply(request,{error:"Recording must be between 1 byte and 50 MB"},413);
 const tokenHash=hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token)));
 const authResponse=await fetch(env.SUPABASE_URL+"/rest/v1/rpc/twiga_consume_internal_upload_token",{method:"POST",headers:{apikey:env.SUPABASE_KEY,Authorization:"Bearer "+env.SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify({p_token_hash:tokenHash})});
 if(!authResponse.ok)return reply(request,{error:"Upload authorisation check failed"},503);
 const authData=await authResponse.json().catch(()=>null),authRow=Array.isArray(authData)?authData[0]:authData;
 if(!authRow?.business_id||authRow.purpose!=="retell_recording")return reply(request,{error:"Upload token is invalid, expired or already used"},401);
 const businessId=String(authRow.business_id),objectKey="businesses/"+businessId+"/calls/"+callId;
 const previous=await env.TWIGA_CALLS.head(objectKey),oldSize=previous?Number(previous.size||0):0,delta=bytes.byteLength-oldSize;
 try{await reserve(env,businessId,delta);}catch(e){if(String(e.message)==="STORAGE_QUOTA")return reply(request,{error:"This business has reached its 500 MB storage allowance."},413);throw e;}
 try{
  const stored=await env.TWIGA_CALLS.put(objectKey,bytes,{httpMetadata:{contentType,cacheControl:"private, no-store"},customMetadata:{business_id:businessId,provider_call_id:callId,uploaded_at:new Date().toISOString()}});
  if(delta<0)await release(env,businessId,-delta);
  return reply(request,{stored:true,businessId,objectKey,sizeBytes:bytes.byteLength,etag:stored.etag,contentType,quotaBytes:QUOTA});
 }catch(e){if(delta>0)await release(env,businessId,delta).catch(()=>{});return reply(request,{error:"Recording could not be saved."},500);}
}};