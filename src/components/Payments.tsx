import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useStore, uid, stamp, type PaymentStatus } from "@/lib/store";
import AnimatedNumber from "@/components/AnimatedNumber";
import {
  IconCard,
  IconPhone,
  IconCheck,
  IconClock,
  IconClose,
  IconSend,
  IconLink,
  IconCoin,
  IconGear,
  IconSparkle,
  IconBell,
} from "@/components/Icons";

const statusConfig: Record<
  PaymentStatus,
  { label: string; icon: typeof IconCheck; chip: string }
> = {
  paid: {
    label: "Paid",
    icon: IconCheck,
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  pending: {
    label: "Pending",
    icon: IconClock,
    chip: "border-amber-200 bg-amber-50 text-amber-700",
  },
  expired: {
    label: "Expired",
    icon: IconClose,
    chip: "border-neutral-200 bg-neutral-100 text-neutral-600",
  },
};

type Tab = "collect" | "keys";

export default function Payments() {
  const {
    payments,
    addPayment,
    markPaid,
    addMessage,
    settings,
    palplusKey,
    setPalplusKey,
  } = useStore();

  const [tab, setTab] = useState<Tab>("collect");
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [keyDraft, setKeyDraft] = useState(palplusKey);
  const [keySaved, setKeySaved] = useState(false);

  const currency = settings.business.currency;
  const hasKey = palplusKey.trim().length > 0;

  const collected = payments
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amount, 0);
  const outstanding = payments
    .filter((p) => p.status === "pending")
    .reduce((sum, p) => sum + p.amount, 0);

  const createLink = () => {
    const value = Number(amount);
    if (!customer.trim() || !phone.trim() || !value) return;
    const link = `https://pay.palplus.io/${uid()}`;
    addPayment({
      id: uid(),
      customer: customer.trim(),
      phone: phone.trim(),
      amount: value,
      note: note.trim() || "Payment request",
      status: "pending",
      link,
      time: stamp(),
    });
    addMessage({
      id: uid(),
      to: customer.trim(),
      phone: phone.trim(),
      body: `Hi ${customer.trim()}, please pay ${currency} ${value.toLocaleString()} securely here: ${link}`,
      status: "sent",
      time: stamp(),
    });
    setCustomer("");
    setPhone("");
    setAmount("");
    setNote("");
  };

  const prompt = (id: string, name: string, ph: string, amt: number, link: string) => {
    addMessage({
      id: uid(),
      to: name,
      phone: ph,
      body: `Reminder: your payment of ${currency} ${amt.toLocaleString()} is still open. Tap to pay: ${link}`,
      status: "sent",
      time: stamp(),
    });
    void id;
  };

  const saveKey = () => {
    setPalplusKey(keyDraft.trim());
    setKeySaved(true);
    window.setTimeout(() => setKeySaved(false), 1800);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
            Collections
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-neutral-900">
            Payments
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            PalPlus links pushed straight to your customers' phones
          </p>
        </div>
        <div className="flex gap-3">
          <MoneyBlock
            label="Collected"
            value={collected}
            currency={currency}
          />
          <MoneyBlock
            label="Outstanding"
            value={outstanding}
            currency={currency}
          />
        </div>
      </div>

      {!hasKey && (
        <div className="flex flex-col gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white">
              <IconGear className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-neutral-900">
                Connect your PalPlus account
              </p>
              <p className="text-xs text-neutral-600">
                Paste your PalPlus API key to start generating payment links and
                prompting customers.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setTab("keys")}
            className="shrink-0 rounded-xl bg-neutral-950 text-white hover:bg-neutral-800"
          >
            Add API key
          </Button>
        </div>
      )}

      <div className="flex rounded-xl border border-neutral-200 bg-white p-1 shadow-sm">
        <TabButton active={tab === "collect"} onClick={() => setTab("collect")}>
          Collect
        </TabButton>
        <TabButton active={tab === "keys"} onClick={() => setTab("keys")}>
          API Keys
        </TabButton>
      </div>

      {tab === "collect" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="rounded-2xl border-neutral-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                  <IconLink className="h-4 w-4" />
                </span>
                New payment link
              </CardTitle>
              <CardDescription>
                Generate a PalPlus link and push it to their phone
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Customer
                </Label>
                <Input
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="e.g. Grace Mwangi"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Phone number
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+254 7xx xxx xxx"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Amount ({currency})
                </Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="4500"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                  Note (optional)
                </Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Hair treatment deposit"
                />
              </div>
              <Button
                onClick={createLink}
                disabled={
                  !hasKey || !customer.trim() || !phone.trim() || !amount
                }
                className={cn(
                  "w-full rounded-xl bg-orange-500 text-white hover:bg-orange-600",
                  (!hasKey || !customer.trim() || !phone.trim() || !amount) &&
                    "opacity-50"
                )}
              >
                <IconSend className="mr-2 h-4 w-4" />
                Generate &amp; send link
              </Button>
              {!hasKey && (
                <p className="text-center text-xs text-neutral-400">
                  Add your PalPlus API key to enable sending
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-neutral-200 shadow-sm lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                  <IconCard className="h-4 w-4" />
                </span>
                Payment requests
              </CardTitle>
              <CardDescription>
                Prompt customers again or mark them paid
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {payments.length === 0 && (
                <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
                  No payment requests yet.
                </div>
              )}
              {payments.map((p) => {
                const cfg = statusConfig[p.status];
                const StatusIcon = cfg.icon;
                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-3 rounded-xl border border-neutral-100 bg-white p-4 transition-colors hover:border-neutral-200 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-950 text-white">
                        <IconPhone className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-neutral-900">
                          {p.customer}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {p.phone} · {p.time}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-orange-600">
                          {p.link}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-bold text-neutral-900">
                        {currency} {p.amount.toLocaleString()}
                      </span>
                      <Badge className={cn("gap-1 border", cfg.chip)}>
                        <StatusIcon className="h-3 w-3" />
                        {cfg.label}
                      </Badge>
                      {p.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              prompt(p.id, p.customer, p.phone, p.amount, p.link)
                            }
                            className="rounded-lg border-orange-200 text-orange-600 hover:bg-orange-50"
                          >
                            <IconBell className="mr-1 h-3.5 w-3.5" /> Prompt
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => markPaid(p.id)}
                            className="rounded-lg bg-neutral-950 text-white hover:bg-neutral-800"
                          >
                            Mark paid
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="rounded-2xl border-neutral-900 bg-neutral-950 text-white shadow-lg lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-white">
                  <IconGear className="h-4 w-4" />
                </span>
                PalPlus API key
              </CardTitle>
              <CardDescription className="text-neutral-400">
                Paste the key from your PalPlus dashboard to enable live links
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                  Secret key
                </Label>
                <Input
                  type="password"
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder="pp_live_xxxxxxxxxxxxxxxxxxxx"
                  className="border-neutral-700 bg-neutral-900 font-mono text-white placeholder:text-neutral-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={saveKey}
                  disabled={!keyDraft.trim()}
                  className={cn(
                    "rounded-xl bg-orange-500 text-white hover:bg-orange-600",
                    !keyDraft.trim() && "opacity-50"
                  )}
                >
                  <IconCheck className="mr-2 h-4 w-4" /> Save key
                </Button>
                {keySaved && (
                  <span className="flex items-center gap-1.5 text-sm text-orange-400">
                    <IconCheck className="h-4 w-4" /> Saved
                  </span>
                )}
              </div>
              <div className="flex items-start gap-2 rounded-xl bg-white/5 p-3">
                <IconSparkle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                <p className="text-xs text-neutral-300">
                  Your key is stored locally in this session only. It is used to
                  generate PalPlus payment links and push prompts to customer
                  phones.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-neutral-200 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-500">
                  <IconLink className="h-4 w-4" />
                </span>
                Connection
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white px-4 py-3">
                <span className="text-sm text-neutral-600">Status</span>
                <Badge
                  className={cn(
                    "gap-1 border",
                    hasKey
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-neutral-200 bg-neutral-100 text-neutral-600"
                  )}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      hasKey ? "bg-emerald-500" : "bg-neutral-400"
                    )}
                  />
                  {hasKey ? "Connected" : "Not connected"}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white px-4 py-3">
                <span className="text-sm text-neutral-600">Provider</span>
                <span className="text-sm font-semibold text-neutral-900">
                  PalPlus
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white px-4 py-3">
                <span className="text-sm text-neutral-600">Links sent</span>
                <span className="text-sm font-semibold text-neutral-900">
                  {payments.length}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function MoneyBlock({
  label,
  value,
  currency,
}: {
  label: string;
  value: number;
  currency: string;
}) {
  return (
    <div className="min-w-40 rounded-2xl bg-neutral-950 px-5 py-4 shadow-lg">
      <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
        {label}
      </p>
      <p className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
        <IconCoin className="h-5 w-5 text-orange-500" />
        <AnimatedNumber value={value} prefix={`${currency} `} />
      </p>
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
        active
          ? "bg-neutral-950 text-white"
          : "text-neutral-500 hover:text-neutral-900"
      )}
    >
      {children}
    </button>
  );
}