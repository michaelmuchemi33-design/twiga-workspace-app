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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useStore, uid, stamp } from "@/lib/store";
import {
  IconChat,
  IconSend,
  IconCheck,
  IconClock,
  IconBox,
  IconCard,
} from "@/components/Icons";

export default function WhatsAppOutbox() {
  const { messages, addMessage } = useStore();
  const [to, setTo] = useState("");
  const [phone, setPhone] = useState("");
  const [body, setBody] = useState("");

  const send = () => {
    if (!to.trim() || !phone.trim() || !body.trim()) return;
    addMessage({
      id: uid(),
      to: to.trim(),
      phone: phone.trim(),
      body: body.trim(),
      status: "queued",
      time: stamp(),
    });
    setTo("");
    setPhone("");
    setBody("");
  };

  const quickTemplates = [
    {
      icon: IconBox,
      label: "Delivery update",
      text: "Hi! Your order is on the way 🚚 ETA 30 mins. Track: frontdesk.ai/track",
    },
    {
      icon: IconCard,
      label: "Payment reminder",
      text: "Friendly reminder — your payment link is still open. Tap to pay securely.",
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="rounded-2xl border-neutral-200 shadow-sm lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl font-semibold">
              <IconChat className="h-5 w-5 text-orange-500" /> WhatsApp Outbox
            </CardTitle>
            <CardDescription>
              Messages your receptionist sends to customers
            </CardDescription>
          </div>
          <Badge className="border-neutral-900 bg-neutral-950 text-white">
            {messages.length} sent
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-8 text-center text-sm text-neutral-500">
              No messages yet.
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-neutral-100 bg-white p-4 transition-colors hover:border-neutral-200 hover:bg-neutral-50"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-900">{m.to}</p>
                <span className="flex items-center gap-1 text-xs text-neutral-400">
                  {m.status === "delivered" ? (
                    <>
                      <IconCheck className="h-3.5 w-3.5 text-orange-500" /> Delivered
                    </>
                  ) : (
                    <>
                      <IconClock className="h-3.5 w-3.5" /> Queued
                    </>
                  )}
                  · {m.time}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{m.phone}</p>
              <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                {m.body}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="sticky top-6 h-fit rounded-2xl border-neutral-900 bg-neutral-950 text-white shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <IconSend className="h-5 w-5 text-orange-500" /> Compose
          </CardTitle>
          <CardDescription className="text-neutral-400">
            Send a WhatsApp message
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-neutral-300">Customer</Label>
            <Input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="Grace M."
              className="border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-neutral-300">Phone</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+254 733 987 654"
              className="border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-neutral-300">Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your message…"
              rows={4}
              className="border-neutral-700 bg-neutral-900 text-white placeholder:text-neutral-500"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-neutral-300">Quick templates</Label>
            <div className="space-y-2">
              {quickTemplates.map((t) => (
                <button
                  key={t.label}
                  onClick={() => setBody(t.text)}
                  className="flex w-full items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-left text-sm transition-colors hover:bg-white/10"
                >
                  <t.icon className="h-4 w-4 text-orange-500" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={send}
            disabled={!to.trim() || !phone.trim() || !body.trim()}
            className={cn(
              "w-full bg-orange-500 text-white hover:bg-orange-600",
              (!to.trim() || !phone.trim() || !body.trim()) && "opacity-60"
            )}
          >
            <IconSend className="mr-2 h-4 w-4" /> Send message
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}