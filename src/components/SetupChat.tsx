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
  { icon: IconUsers, label: "Business identity" },
  { icon: IconBox, label: "Products & services" },
  { icon: IconCard, label: "Pricing & payments" },
  { icon: IconCalendar, label: "Hours & bookings" },
  { icon: IconPhone, label: "Phone line" },
  { icon: IconChat, label: "WhatsApp agent" },
];

let uid = 0;
const nextId = () => `m${++uid}`;

export default function SetupChat({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId(),
      role: "ai",
      text:
        "Hi! I'm your setup assistant. Tell me about your business — the name, what you sell, your prices and hours. You can also upload photos of your menu, price list or logo, and I'll build your full profile automatically.",
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
            "Got it — I've added that to your profile. Anything else? Add more detail, upload another file, or tap Build my profile when you're ready.",
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
              "Your profile is built and your AI receptionist is live. I can now answer calls, book appointments, take payments and reply on WhatsApp for you.",
          },
        ]);
      }
    }, 700);
  };

  const progress = Math.min(100, (built / buildSteps.length) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="setup-panel relative flex h-full max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-black shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black">
              <IconSparkle className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Set up with AI</p>
              <p className="text-xs text-neutral-500">
                {done ? "Profile complete" : "Building your business profile"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-900 hover:text-white"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-neutral-800 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full rounded-full bg-white transition-all duration-700"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs font-medium text-neutral-500">
              {built}/{buildSteps.length}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {buildSteps.map((s, i) => {
              const on = i < built || done;
              return (
                <span
                  key={s.label}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                    on
                      ? "border-white/40 bg-white/10 text-white"
                      : "border-neutral-800 text-neutral-600"
                  )}
                >
                  {on ? (
                    <IconCheck className="h-3 w-3" />
                  ) : (
                    <s.icon className="h-3 w-3" />
                  )}
                  {s.label}
                </span>
              );
            })}
          </div>
        </div>

        <div
          ref={scrollRef}
          className="live-scroll flex-1 space-y-4 overflow-y-auto px-5 py-5"
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

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-600">
              Upload menus, price lists or logos — the AI reads them.
            </p>
            <button
              onClick={build}
              disabled={thinking || done}
              className={cn(
                "flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition-all hover:bg-neutral-200 active:scale-95",
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
        </div>
      </div>
    </div>
  );
}