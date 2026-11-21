import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type FormState = {
  name: string;
  businessType: string;
  description: string;
  products: string;
  hours: string;
  location: string;
};

const blankForm: FormState = {
  name: "",
  businessType: "general",
  description: "",
  products: "",
  hours: "",
  location: "",
};

const demoForm: FormState = {
  name: "Nairobi Fresh Cuts",
  businessType: "barbershop",
  description: "A neighbourhood barbershop offering reliable cuts and grooming services.",
  products: "Standard haircut — KSh 500; Beard trim — KSh 300; Haircut and beard — KSh 700",
  hours: "Monday–Saturday, 8:00 AM–6:00 PM",
  location: "Nairobi",
};

export default function SetupPage({ demo = false, businessId = "", onDone, onBusinessCreated }: {
  demo?: boolean;
  businessId?: string;
  onDone: () => void;
  onBusinessCreated: (id: string) => void;
}) {
  const [form, setForm] = useState<FormState>(demo ? demoForm : blankForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [savedProfile, setSavedProfile] = useState<Record<string, any>>({});

  useEffect(() => {
    if (demo || !businessId || !supabase) return;
    let active = true;
    setLoading(true);
    void Promise.all([
      supabase.from("businesses").select("name,business_type").eq("id", businessId).maybeSingle(),
      supabase.from("twiga_business_profiles").select("*").eq("business_id", businessId).maybeSingle(),
    ]).then(([businessResult, profileResult]) => {
      if (!active) return;
      if (businessResult.error) throw businessResult.error;
      if (profileResult.error) throw profileResult.error;
      const business = businessResult.data || {};
      const profile = profileResult.data || {};
      setSavedProfile(profile);
      setForm({
        name: String(business.name || ""),
        businessType: String(business.business_type || "general"),
        description: String(profile.business_summary || profile.what_they_do || ""),
        products: String(profile.products_and_services || profile.what_they_sell || ""),
        hours: String(profile.opening_hours || ""),
        location: String(profile.service_area || ""),
      });
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : "Business details could not be loaded.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [businessId, demo]);

  const change = (key: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setNotice("");
    setError("");
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (demo) {
      setNotice("This is a sample business. Changes in the demo are not saved.");
      return;
    }
    if (!supabase) {
      setError("TWIGA is not connected. Refresh the page and sign in again.");
      return;
    }
    if (form.name.trim().length < 2 || form.description.trim().length < 5) {
      setError("Add your business name and a short description first.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData.user;
      const profile = {
        ...savedProfile,
        business_name: form.name.trim(),
        business_type: form.businessType,
        owner_name: String(user?.user_metadata?.full_name || user?.user_metadata?.name || ""),
        owner_email: String(user?.email || ""),
        business_summary: form.description.trim(),
        what_they_do: form.description.trim(),
        what_they_sell: form.products.trim(),
        products_and_services: form.products.trim(),
        opening_hours: form.hours.trim(),
        service_area: form.location.trim(),
        timezone: "Africa/Nairobi",
        reply_language: "match_customer",
        brand_voice: "Warm, clear, helpful and professional",
        receptionist_greeting: "Hello, thank you for calling " + form.name.trim() + ". How can I help you today?",
        assistant_instructions: "You are the receptionist for " + form.name.trim() + ". Use only the saved business details and connected TWIGA records. Reply in the customer's language, keep answers short, do not invent prices or availability, and send requests that need confirmation to the business team.",
      };
      const body = businessId
        ? { action: "update_profile", businessId, profile }
        : { action: "create", name: form.name.trim(), businessType: form.businessType, profile };
      const { data, error: invokeError } = await supabase.functions.invoke("twiga-business-workspaces", { body });
      if (invokeError) {
        const detail = (invokeError as any)?.context;
        const payload = detail && typeof detail.clone === "function" ? await detail.clone().json().catch(() => null) : null;
        throw new Error(String(payload?.error || invokeError.message || "Business details could not be saved."));
      }
      if (data?.error) throw new Error(String(data.error));
      if (data?.created && data?.business?.id) onBusinessCreated(String(data.business.id));
      setNotice("Business details saved.");
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Business details could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = "mt-1.5 w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-3 text-sm text-neutral-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100";
  const labelClass = "block text-sm font-medium text-neutral-800";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">Business profile</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-950">Tell TWIGA about your business</h1>
        <p className="mt-1 text-sm leading-6 text-neutral-600">Just the essentials. You can update these details any time.</p>
      </div>

      {demo && <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">Sample business profile — changes here do not affect a real business.</div>}
      {loading && <div className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-500">Loading business details…</div>}

      <form onSubmit={save} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6">
        <label className={labelClass}>Business name
          <input required minLength={2} maxLength={120} value={form.name} onChange={(event) => change("name", event.target.value)} placeholder="e.g. Nairobi Fresh Cuts" className={fieldClass} />
        </label>

        <label className={labelClass}>Business type
          <select value={form.businessType} onChange={(event) => change("businessType", event.target.value)} className={fieldClass}>
            <option value="general">General business</option>
            <option value="salon">Salon</option>
            <option value="barbershop">Barbershop</option>
            <option value="retail">Retail shop</option>
            <option value="restaurant">Restaurant / café</option>
            <option value="professional_services">Professional services</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className={labelClass}>What does your business do?
          <textarea required minLength={5} maxLength={4000} rows={3} value={form.description} onChange={(event) => change("description", event.target.value)} placeholder="Describe what customers come to you for…" className={fieldClass} />
        </label>

        <label className={labelClass}>Products or services and prices
          <textarea maxLength={6000} rows={3} value={form.products} onChange={(event) => change("products", event.target.value)} placeholder="List your main services, products and prices…" className={fieldClass} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>Opening hours
            <input maxLength={500} value={form.hours} onChange={(event) => change("hours", event.target.value)} placeholder="e.g. Mon–Sat, 8am–6pm" className={fieldClass} />
          </label>
          <label className={labelClass}>Location / service area
            <input maxLength={500} value={form.location} onChange={(event) => change("location", event.target.value)} placeholder="e.g. Westlands, Nairobi" className={fieldClass} />
          </label>
        </div>

        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5 text-sm text-orange-900">{notice}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
          <p className="text-xs text-neutral-500">No AI setup chat, long questionnaire or API keys needed.</p>
          <button type="submit" disabled={saving || loading || demo} className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
            {demo ? "Demo preview" : saving ? "Saving…" : "Save business details"}
          </button>
        </div>
      </form>
    </div>
  );
}
