import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  IconSparkle,
  IconClose,
  IconSend,
  IconFile,
  IconCheck,
  IconPhone,
  IconCalendar,
  IconCard,
  IconChat,
  IconUsers,
  IconBox,
  IconArrowUpRight,
} from "@/components/Icons";

interface Attachment {
  id: string;
  name: string;
  kind: "image" | "file";
}

interface Message {
  id: string;
  role: "ai" | "user";
  text: string;
  attachments?: Attachment[];
}

const quickPrompts = [
  "I run a salon in Nairobi called Nairobi Style Studio",
  "We offer braiding, manicures and makeup",
  "Our prices start at KSh 800",
  "We're open Mon–Sat, 9am to 8pm",
];

const buildSteps = [
  { icon: IconUsers, label: "Business identity", detail: "Name, location, category" },
  { icon: IconBox, label: "Products & services", detail: "What you sell" },
  { icon: IconCard, label: "Pricing & payments", detail: "Rates and pay methods" },
  { icon: IconCalendar, label: "Hours & bookings", detail: "Open times and slots" },
  { icon: IconPhone, label: "Phone line", detail: "Number the AI answers" },
  { icon: IconChat, label: "WhatsApp agent", detail: "Auto-reply behaviour" },
];

let uid = 0;
const nextId = () => `m${++uid}`;

export default function SetupPage({ onDone }: { onDone: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId(),
      role: "ai",
      text:
        "Hi! I can guide you through preparing your business profile. Tell me your business name, services, prices and opening hours. You can also attach a menu or price list as a reference. This guided preview does not activate calls or connect a live AI provider yet.",
    },
  ]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [thinking, setThinking] = useState(false);
  const [built, setBuilt] = useState(0);
  const [done, setDone] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, thinking]);

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const next: Attachment[] = Array.from(files).map((f) => ({
      id: nextId(),
      name: f.name,
      kind: f.type.startsWith("image/") ? "image" : "file",
    }));
    setAttachments((a) => [...a, ...next]);
  };

  const send = (text?: string) => {
    const body = (text ?? input).trim();
    if (!body && attachments.length === 0) return;

    setMessages((m) => [
      ...m,
      { id: nextId(), role: "user", text: body, attachments },
    ]);
    setInput("");
    setAttachments([]);
    setThinking(true);

    window.setTimeout(() => {
      setThinking(false);
      setMessages((m) => [
        ...m,
        {
          id: nextId(),
          role: "ai",
          text:
            "Thanks — that is useful setup information. Add more details or upload another reference, then choose Build my profile to prepare your draft.",
        },
      ]);
    }, 900);
  };

  const build = () => {
    setThinking(true);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setBuilt(i);
      if (i >= buildSteps.length) {
        window.clearInterval(id);
        setThinking(false);
        setDone(true);
        setMessages((m) => [
          ...m,
          {
            id: nextId(),
            role: "ai",
            text:
              "Your business profile draft is ready in this workspace. Before a receptionist can answer real calls or send messages, a voice provider, phone line and messaging integrations must be connected and tested.",
          },
        ]);
      }
    }, 700);
  };

  const progress = Math.min(100, (built / buildSteps.length) * 100);

  return (
    <div className="setup-panel space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-black p-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-black">
            <IconSparkle className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              AI Setup
            </p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight">
              Set up your business
            </h1>
            <p className="mt-0.5 text-sm text-neutral-400">
              {done
                ? "Profile draft prepared — integrations still need connecting"
                : "Chat, upload files, and let the AI build your profile"}
            </p>
          </div>
        </div>

        <button
          onClick={onDone}
          className="flex items-center gap-2 self-start rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-all hover:bg-neutral-200 active:scale-95 sm:self-auto"
        >
          <IconArrowUpRight className="h-4 w-4" />
          Back to dashboard
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col overflow-hidden rounded-2xl border border-neutral-800 bg-black shadow-lg lg:col-span-2">
          <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-black">
                <IconSparkle className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-white">Setup assistant</p>
                <p className="text-xs text-neutral-500">
                  {thinking ? "Thinking…" : "Ready"}
                </p>
              </div>
            </div>
            <span className="flex items-center gap-2 rounded-full border border-neutral-800 px-3 py-1 text-xs text-neutral-400">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              {built}/{buildSteps.length} steps
            </span>
          </div>

          <div
            ref={scrollRef}
            className="live-scroll h-80 space-y-4 overflow-y-auto px-5 py-5 lg:h-96"
          >
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "live-row flex gap-3",
                  m.role === "user" && "flex-row-reverse"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    m.role === "ai"
                      ? "bg-white text-black"
                      : "bg-neutral-800 text-neutral-300"
                  )}
                >
                  {m.role === "ai" ? (
                    <IconSparkle className="h-4 w-4" />
                  ) : (
                    <IconUsers className="h-4 w-4" />
                  )}
                </span>
                <div
                  className={cn(
                    "max-w-[80%] space-y-2 rounded-2xl px-4 py-3 text-sm",
                    m.role === "ai"
                      ? "bg-neutral-900 text-neutral-200"
                      : "bg-white text-black"
                  )}
                >
                  {m.text && <p className="leading-relaxed">{m.text}</p>}
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {m.attachments.map((a) => (
                        <span
                          key={a.id}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs",
                            m.role === "ai"
                              ? "bg-white/10 text-neutral-300"
                              : "bg-black/10 text-black"
                          )}
                        >
                          <IconFile className="h-3 w-3" />
                          {a.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {thinking && (
              <div className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-black">
                  <IconSparkle className="h-4 w-4 animate-spin" />
                </span>
                <div className="flex items-center gap-1.5 rounded-2xl bg-neutral-900 px-4 py-3">
                  <span className="setup-dot h-1.5 w-1.5 rounded-full bg-white" />
                  <span className="setup-dot h-1.5 w-1.5 rounded-full bg-white" />
                  <span className="setup-dot h-1.5 w-1.5 rounded-full bg-white" />
                </div>
              </div>
            )}
          </div>

          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 px-5 pb-2">
              {quickPrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-white/40 hover:text-white active:scale-95"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-neutral-800 px-5 py-3">
              {attachments.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300"
                >
                  <IconFile className="h-3 w-3" />
                  {a.name}
                  <button
                    onClick={() =>
                      setAttachments((x) => x.filter((y) => y.id !== a.id))
                    }
                    className="ml-1 rounded-full p-0.5 hover:bg-neutral-800"
                  >
                    <IconClose className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="border-t border-neutral-800 px-5 py-4">
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.csv,.doc,.docx"
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-700 text-neutral-400 transition-colors hover:border-white/40 hover:bg-neutral-900 hover:text-white active:scale-90"
              >
                <IconFile className="h-5 w-5" />
              </button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Describe your business, or upload photos and files…"
                className="min-h-11 flex-1 resize-none rounded-xl border-neutral-700 bg-neutral-900 text-sm text-neutral-100 placeholder:text-neutral-500 focus-visible:ring-white"
                rows={1}
              />
              <button
                onClick={() => send()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-black transition-all hover:bg-neutral-200 active:scale-90"
              >
                <IconSend className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-neutral-800 bg-black p-5 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Profile build</p>
              <span className="text-xs text-neutral-500">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-white transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-4 space-y-2">
              {buildSteps.map((s, i) => {
                const on = i < built || done;
                return (
                  <div
                    key={s.label}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                      on
                        ? "border-white/30 bg-white/10"
                        : "border-neutral-800 bg-neutral-900/50"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-lg",
                        on ? "bg-white text-black" : "bg-neutral-800 text-neutral-500"
                      )}
                    >
                      {on ? (
                        <IconCheck className="h-4 w-4" />
                      ) : (
                        <s.icon className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          on ? "text-white" : "text-neutral-400"
                        )}
                      >
                        {s.label}
                      </p>
                      <p className="truncate text-xs text-neutral-500">
                        {s.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={build}
              disabled={thinking || done}
              className={cn(
                "mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition-all hover:bg-neutral-200 active:scale-95",
                (thinking || done) && "opacity-60"
              )}
            >
              {done ? (
                <>
                  <IconCheck className="h-4 w-4" /> Profile built
                </>
              ) : (
                <>
                  <IconSparkle className="h-4 w-4" /> Build my profile
                </>
              )}
            </button>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-black p-5 text-white shadow-lg">
            <p className="text-sm font-semibold">What the AI will do</p>
            <div className="mt-3 space-y-2">
              {[
                { icon: IconPhone, label: "Answer every call 24/7" },
                { icon: IconCalendar, label: "Book appointments" },
                { icon: IconCard, label: "Send payment links" },
                { icon: IconChat, label: "Reply on WhatsApp" },
              ].map((r) => (
                <div
                  key={r.label}
                  className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2"
                >
                  <r.icon className="h-4 w-4 text-white" />
                  <span className="text-sm text-neutral-300">{r.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}