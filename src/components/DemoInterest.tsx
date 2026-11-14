import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabase";
const WHATSAPP = "254793832286";
export default function DemoInterest() {
  const [open,setOpen] = useState(false);
  const [name,setName] = useState("");
  const [business,setBusiness] = useState("");
  const [email,setEmail] = useState("");
  const [phone,setPhone] = useState("");
  const [method,setMethod] = useState<"WhatsApp"|"Email">("WhatsApp");
  const [message,setMessage] = useState("I'd like to learn more about TWIGA for my business.");
  const [website,setWebsite] = useState("");
  const [busy,setBusy] = useState(false);
  const [done,setDone] = useState(false);
  const [error,setError] = useState("");
  const submit = async (e:FormEvent) => {
    e.preventDefault(); if(website) return;
    setBusy(true); setError("");
    const payload={name:name.trim(),business_name:business.trim(),email:email.trim(),phone:phone.trim(),preferred_contact:method.toLowerCase(),message:message.trim()};
    if(supabase){
      const {error:saveError}=await supabase.from("twiga_demo_interests").insert(payload);
      if(saveError){setError("We couldn't save your enquiry just now. Please use the WhatsApp contact option below.");setBusy(false);return;}
    }
    setDone(true); setBusy(false);
    if(method === "WhatsApp") {
      const body=encodeURIComponent(`Hello TWIGA, I'm interested in the service.\nName: ${payload.name}\nBusiness: ${payload.business_name}\nEmail: ${payload.email}\nPhone: ${payload.phone}\nMessage: ${payload.message}`);
      window.open(`https://wa.me/${WHATSAPP}?text=${body}`,"_blank","noopener,noreferrer");
    }
  };
  return <>
    <button onClick={()=>setOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-bold text-white shadow-lg shadow-orange-500/20 transition hover:-translate-y-0.5 hover:bg-orange-600">Interested in TWIGA? <span aria-hidden>↗</span></button>
    {open && <div className="fixed inset-0 z-[110] grid place-items-center bg-neutral-950/60 p-4 backdrop-blur-sm" onClick={()=>setOpen(false)}>
      <section onClick={e=>e.stopPropagation()} className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-orange-500">TWIGA demo</p><h2 className="mt-2 text-2xl font-bold tracking-tight text-neutral-950">Let's talk about your business.</h2><p className="mt-1 text-sm leading-6 text-neutral-500">Leave your details and choose whether you'd prefer a WhatsApp or email follow-up.</p></div><button onClick={()=>setOpen(false)} aria-label="Close" className="rounded-full bg-neutral-100 px-3 py-2 text-neutral-500">✕</button></div>
        {done ? <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 p-5"><p className="font-semibold text-green-900">Thank you — your interest has been recorded.</p><p className="mt-1 text-sm text-green-800">{method === "WhatsApp" ? "WhatsApp should have opened with your details ready to send. Complete that message so our team can reply." : "We have your email preference and contact details."}</p><button onClick={()=>setOpen(false)} className="mt-4 rounded-xl bg-neutral-950 px-4 py-2 text-sm font-semibold text-white">Close</button></div> : <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-neutral-700">Your name<input required value={name} onChange={e=>setName(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 outline-none focus:border-orange-400" placeholder="Full name"/></label>
          <label className="block text-sm font-medium text-neutral-700">Business name<input required value={business} onChange={e=>setBusiness(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 outline-none focus:border-orange-400" placeholder="Your business"/></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium text-neutral-700">Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 outline-none focus:border-orange-400" placeholder="you@example.com"/></label><label className="block text-sm font-medium text-neutral-700">WhatsApp / phone<input required value={phone} onChange={e=>setPhone(e.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 px-3 outline-none focus:border-orange-400" placeholder="+254 7…"/></label></div>
          <label className="block text-sm font-medium text-neutral-700">How should we follow up?<select value={method} onChange={e=>setMethod(e.target.value as "WhatsApp"|"Email")} className="mt-1.5 h-11 w-full rounded-xl border border-neutral-200 bg-white px-3"><option>WhatsApp</option><option>Email</option></select></label>
          <label className="block text-sm font-medium text-neutral-700">What would you like to know?<textarea value={message} onChange={e=>setMessage(e.target.value)} rows={3} className="mt-1.5 w-full rounded-xl border border-neutral-200 px-3 py-2 outline-none focus:border-orange-400"/></label>
          <label className="hidden" aria-hidden>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={e=>setWebsite(e.target.value)}/></label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <p className="text-xs leading-5 text-neutral-400">By submitting, you agree that TWIGA may use these details to respond to your enquiry. We do not display your details in the public demo.</p>
          <button disabled={busy} className="h-12 w-full rounded-xl bg-orange-500 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{busy ? "Sending…" : "Send my interest"}</button>
        </form>}
      </section>
    </div>}
  </>;
}
