const CHAT_MODEL="@cf/meta/llama-3.1-8b-instruct-fp8",STT_MODEL="@cf/openai/whisper-large-v3-turbo";
const SYSTEM=`You are Voice Test 1, a friendly, concise AI receptionist. Speak naturally and warmly. Keep answers short, usually one or two sentences. Use clear international English and understand Kenyan English. If the caller speaks Kiswahili or mixes English and Kiswahili, respond naturally in the same language style. Ask one question at a time. Never invent prices, opening hours, bookings, policies or customer records. If information is missing, say so and ask. Do not claim you have booked, transferred, called, sent a message or changed a record unless a connected tool confirms it. Avoid markdown, bullet lists and emojis because your answer will be spoken aloud.`;
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
function history(v){return Array.isArray(v)?v.filter(m=>m&&["user","assistant"].includes(m.role)&&typeof m.content==="string").slice(-10).map(m=>({role:m.role,content:m.content.slice(0,1000)})):[]}
function toBase64(buffer){
  const bytes=new Uint8Array(buffer);
  let binary="";
  const chunkSize=0x8000;
  for(let i=0;i<bytes.length;i+=chunkSize){
    binary+=String.fromCharCode(...bytes.subarray(i,i+chunkSize));
  }
  return btoa(binary);
}
export default {async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==="GET"&&url.pathname==="/health")return json({ok:true,service:"Voice Test 1 free AI backend",freeOnly:true,models:{speechToText:STT_MODEL,language:CHAT_MODEL,textToSpeech:"Browser built-in speechSynthesis (local, no hosted TTS call)"}});
  if(request.method!=="POST")return json({error:"Use POST."},405);
  if(!env.APP_SECRET||request.headers.get("authorization")!==`Bearer ${env.APP_SECRET}`)return json({error:"Unauthorized."},401);
  try{
    let text="",messages=[],audioFile=null;
    const ct=request.headers.get("content-type")||"";
    if(ct.includes("multipart/form-data")){
      const form=await request.formData();
      audioFile=form.get("audio");
      try{messages=history(JSON.parse(form.get("messages")||"[]"))}catch{}
      if(!(audioFile instanceof File))return json({error:"No audio was received."},400);
      if(audioFile.size>7*1024*1024)return json({error:"Audio clip is too large. Keep each turn under 14 seconds."},400);
      const audioBuffer=await audioFile.arrayBuffer();
      const audioBase64=toBase64(audioBuffer);
      const tr=await env.AI.run(STT_MODEL,{
        audio:audioBase64,
        task:"transcribe",
        initial_prompt:"Kenyan English, English, Kiswahili and natural code-switching."
      });
      text=String(tr?.text||tr?.transcription_info?.text||"").trim();
      if(!text)return json({error:"I couldn't hear clear speech. Please try again."},422);
    }else{
      const body=await request.json();
      text=String(body.text||"").trim().slice(0,2000);
      messages=history(body.messages);
      if(!text)return json({error:"Enter a message to test."},400);
    }
    const llm=await env.AI.run(CHAT_MODEL,{messages:[{role:"system",content:SYSTEM},...messages,{role:"user",content:text}],temperature:0.35,max_tokens:140});
    const answer=String(llm?.response||llm?.result?.response||"").trim();
    if(!answer)throw new Error("The free language model returned an empty response.");
    return json({transcript:audioFile?text:null,answer,audio:null,audioType:null,model:CHAT_MODEL,transcriptionModel:audioFile?STT_MODEL:null,speechModel:"browser-speechSynthesis",freeOnly:true});
  }catch(e){
    const m=e instanceof Error?e.message:"The free AI request failed.";
    return json({error:/quota|neuron|billing|payment|limit|credit/i.test(m)?"Cloudflare's free Workers AI daily allowance or model limit has been reached. No paid model fallback was used. Try again after the daily reset.":m,freeOnly:true},503);
  }
}};