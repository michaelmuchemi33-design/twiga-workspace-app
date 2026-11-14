import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useStore, type Settings as SettingsType } from "@/lib/store";
import {
  IconGear,
  IconCoin,
  IconCalendar,
  IconClock,
  IconSparkle,
  IconMic,
  IconChat,
  IconPhone,
  IconSwap,
  IconBell,
  IconFile,
  IconCheck,
  IconBulb,
  IconUsers,
} from "@/components/Icons";

type Tab = "basic" | "advanced";

export default function Settings() {
  const { settings, updateSettings } = useStore();
  const [tab, setTab] = useState<Tab>("basic");
  const [saved, setSaved] = useState(false);

  const patch = (group: keyof SettingsType, values: Record<string, unknown>) => {
    updateSettings({ [group]: { ...settings[group], ...values } } as Partial<SettingsType>);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  };

  const b = settings.business;
  const p = settings.persona;
  const r = settings.routing;
  const s = settings.scheduling;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
            Configuration
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            Settings
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Tune how your AI receptionist runs the front desk
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-600">
              <IconCheck className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <div className="flex rounded-xl border border-neutral-200 bg-neutral-50 p-1">
            <TabButton active={tab === "basic"} onClick={() => setTab("basic")}>
              Basic Setup
            </TabButton>
            <TabButton active={tab === "advanced"} onClick={() => setTab("advanced")}>
              Advanced
            </TabButton>
          </div>
        </div>
      </div>

      {tab === "basic" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section icon={IconCoin} title="Business & Localization" desc="Currency, time and how the AI reads dates">
            <Field label="Business name">
              <Input value={b.name} onChange={(e) => patch("business", { name: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <Select value={b.currency} onValueChange={(v) => patch("business", { currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["KSh", "USD", "EUR", "GBP", "ZAR"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Date format">
                <Select value={b.dateFormat} onValueChange={(v) => patch("business", { dateFormat: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Time zone">
              <Select value={b.timezone} onValueChange={(v) => patch("business", { timezone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Africa/Nairobi (GMT+3)", "Africa/Lagos (GMT+1)", "Europe/London (GMT+0)", "America/New_York (GMT-5)"].map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </Section>

          <Section icon={IconClock} title="Business Hours & Holidays" desc="When the AI says you are open or closed">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Opens at">
                <Input type="time" value={b.openTime} onChange={(e) => patch("business", { openTime: e.target.value })} />
              </Field>
              <Field label="Closes at">
                <Input type="time" value={b.closeTime} onChange={(e) => patch("business", { closeTime: e.target.value })} />
              </Field>
            </div>
            <ToggleRow
              label="Holiday override"
              desc="Use special hours on public holidays"
              checked={b.holidayOverride}
              onChange={(v) => patch("business", { holidayOverride: v })}
            />
          </Section>

          <Section icon={IconFile} title="Business Profile & Knowledge Base" desc="Facts the AI uses to answer without guessing">
            <Field label="Address">
              <Input value={b.address} onChange={(e) => patch("business", { address: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Parking info">
                <Input value={b.parking} onChange={(e) => patch("business", { parking: e.target.value })} />
              </Field>
              <Field label="Website">
                <Input value={b.website} onChange={(e) => patch("business", { website: e.target.value })} />
              </Field>
            </div>
            <Field label="FAQs">
              <Textarea rows={3} value={b.faqs} onChange={(e) => patch("business", { faqs: e.target.value })} />
            </Field>
          </Section>

          <Section icon={IconMic} title="Voice Selection & Accent" desc="How your AI sounds on the phone">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Voice">
                <Select value={p.voice} onValueChange={(v) => patch("persona", { voice: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Female — Aria", "Female — Luna", "Male — Kai", "Male — Owen"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Accent">
                <Select value={p.accent} onValueChange={(v) => patch("persona", { accent: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Kenyan English", "British English", "American English", "Neutral"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label={`Speaking speed — ${p.speed.toFixed(1)}x`}>
              <Slider
                value={[p.speed]}
                min={0.5}
                max={1.5}
                step={0.1}
                onValueChange={([v]) => patch("persona", { speed: v })}
              />
            </Field>
          </Section>

          <Section icon={IconChat} title="Greeting & Closing Scripts" desc="The first and last thing callers hear">
            <Field label="Greeting">
              <Textarea rows={2} value={p.greeting} onChange={(e) => patch("persona", { greeting: e.target.value })} />
            </Field>
            <Field label="Closing">
              <Textarea rows={2} value={p.closing} onChange={(e) => patch("persona", { closing: e.target.value })} />
            </Field>
          </Section>

          <Section icon={IconSparkle} title="Tone & Personality" desc="Adjust how the AI comes across">
            <div className="flex flex-wrap gap-2">
              {["Formal", "Friendly", "Concise", "Empathetic"].map((t) => (
                <button
                  key={t}
                  onClick={() => patch("persona", { tone: t })}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                    p.tone === t
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Primary language">
                <Select value={p.primaryLang} onValueChange={(v) => patch("persona", { primaryLang: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["English", "Swahili", "French", "Arabic"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Fallback language">
                <Select value={p.fallbackLang} onValueChange={(v) => patch("persona", { fallbackLang: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Swahili", "English", "French", "None"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Section>

          <Section icon={IconCalendar} title="Calendar Sync & Booking Rules" desc="Where bookings land and how they are spaced" className="lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Calendar provider">
                <Select value={s.calendar} onValueChange={(v) => patch("scheduling", { calendar: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Google Calendar", "Outlook", "Calendly", "None"].map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={`Buffer — ${s.bufferMinutes} min`}>
                <Slider value={[s.bufferMinutes]} min={0} max={60} step={5} onValueChange={([v]) => patch("scheduling", { bufferMinutes: v })} />
              </Field>
              <Field label={`Min notice — ${s.minNotice} hrs`}>
                <Slider value={[s.minNotice]} min={0} max={48} step={1} onValueChange={([v]) => patch("scheduling", { minNotice: v })} />
              </Field>
            </div>
            <Field label="Cancellation policy">
              <Input value={s.cancellationPolicy} onChange={(e) => patch("scheduling", { cancellationPolicy: e.target.value })} />
            </Field>
          </Section>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Section icon={IconPhone} title="Call Forwarding & Escalation" desc="When the AI hands a call to a human">
            <ToggleRow label="Caller sounds angry" desc="Detect frustration and transfer" checked={r.forwardOnAngry} onChange={(v) => patch("routing", { forwardOnAngry: v })} />
            <ToggleRow label="Asks for a manager" desc="Immediate transfer on request" checked={r.forwardOnManager} onChange={(v) => patch("routing", { forwardOnManager: v })} />
            <ToggleRow label="Complex question" desc="Transfer when the AI is unsure" checked={r.forwardOnComplex} onChange={(v) => patch("routing", { forwardOnComplex: v })} />
            <Field label="Escalation number">
              <Input value={r.escalationNumber} onChange={(e) => patch("routing", { escalationNumber: e.target.value })} />
            </Field>
          </Section>

          <Section icon={IconUsers} title="Emergency / VIP Bypass" desc="Numbers and words that skip the AI">
            <Field label="VIP phone numbers">
              <Textarea rows={2} value={r.vipNumbers} onChange={(e) => patch("routing", { vipNumbers: e.target.value })} />
            </Field>
            <Field label="Bypass keywords">
              <Input value={r.vipKeywords} onChange={(e) => patch("routing", { vipKeywords: e.target.value })} />
            </Field>
            <div className="flex flex-wrap gap-2 pt-1">
              {r.vipKeywords.split(",").map((k) => (
                <Badge key={k} className="border-orange-200 bg-orange-50 text-orange-600">
                  {k.trim()}
                </Badge>
              ))}
            </div>
          </Section>

          <Section icon={IconClock} title="Call Duration & Silence Timeout" desc="Limits that keep calls tidy">
            <Field label={`Max call duration — ${r.maxDuration} min`}>
              <Slider value={[r.maxDuration]} min={5} max={60} step={5} onValueChange={([v]) => patch("routing", { maxDuration: v })} />
            </Field>
            <Field label={`Silence timeout — ${r.silenceTimeout}s`}>
              <Slider value={[r.silenceTimeout]} min={3} max={30} step={1} onValueChange={([v]) => patch("routing", { silenceTimeout: v })} />
            </Field>
            <div className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-500">
              After {r.silenceTimeout}s of silence the AI asks "Are you still there?" then ends the call.
            </div>
          </Section>

          <Section icon={IconBell} title="Post-Call Notifications" desc="How the owner gets summaries">
            <ToggleRow label="SMS" desc="Text summary to your phone" checked={s.notifySms} onChange={(v) => patch("scheduling", { notifySms: v })} />
            <ToggleRow label="Email" desc="Full transcript by email" checked={s.notifyEmail} onChange={(v) => patch("scheduling", { notifyEmail: v })} />
            <ToggleRow label="Slack" desc="Post to a channel" checked={s.notifySlack} onChange={(v) => patch("scheduling", { notifySlack: v })} />
            <ToggleRow label="Push" desc="In-app notification" checked={s.notifyPush} onChange={(v) => patch("scheduling", { notifyPush: v })} />
          </Section>

          <Section icon={IconSwap} title="Compliance & Call Recording" desc="Recording toggles and legal disclaimer" className="lg:col-span-2">
            <ToggleRow label="Enable call recording" desc="Store audio for quality and disputes" checked={s.recording} onChange={(v) => patch("scheduling", { recording: v })} />
            <Field label="Recording disclaimer">
              <Input value={s.disclaimer} onChange={(e) => patch("scheduling", { disclaimer: e.target.value })} />
            </Field>
            <div className="flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3">
              <IconBulb className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
              <p className="text-xs text-orange-700">
                When recording is on, the AI plays the disclaimer before the greeting.
              </p>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  desc,
  children,
  className,
}: {
  icon: typeof IconGear;
  title: string;
  desc: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-2xl border-neutral-200 shadow-sm", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
            <Icon className="h-4 w-4" />
          </span>
          {title}
        </CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white px-4 py-3 transition-colors hover:border-neutral-200">
      <div>
        <p className="text-sm font-medium text-neutral-900">{label}</p>
        <p className="text-xs text-neutral-500">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
        active ? "bg-neutral-950 text-white" : "text-neutral-500 hover:text-neutral-900"
      )}
    >
      {children}
    </button>
  );
}