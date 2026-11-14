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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  IconSwap,
  IconBulb,
  IconPlus,
  IconInbox,
  IconSend,
  IconTrash,
  IconSparkle,
} from "@/components/Icons";

type Direction = "in" | "out";
type Kind = "task" | "idea";

interface Item {
  id: string;
  text: string;
  direction: Direction;
  kind: Kind;
  tag: string;
}

const seed: Item[] = [
  { id: "o1", text: "Call back: plumber re: leak quote", direction: "out", kind: "task", tag: "Ops" },
  { id: "o2", text: "Client wants invoice split into 2 payments", direction: "in", kind: "task", tag: "Billing" },
  { id: "o3", text: "Idea: loyalty punch-card for regulars", direction: "in", kind: "idea", tag: "Growth" },
  { id: "o4", text: "Send signed contract to vendor", direction: "out", kind: "task", tag: "Legal" },
  { id: "o5", text: "Idea: auto-review request 1 day after visit", direction: "in", kind: "idea", tag: "Growth" },
];

export default function Organizer() {
  const [items, setItems] = useState<Item[]>(seed);
  const [text, setText] = useState("");
  const [direction, setDirection] = useState<Direction>("in");
  const [kind, setKind] = useState<Kind>("task");
  const [tag, setTag] = useState("Ops");

  const add = () => {
    if (!text.trim()) return;
    setItems((s) => [
      { id: Math.random().toString(36).slice(2, 9), text: text.trim(), direction, kind, tag },
      ...s,
    ]);
    setText("");
  };

  const remove = (id: string) => setItems((s) => s.filter((i) => i.id !== id));

  const incoming = items.filter((i) => i.direction === "in");
  const outgoing = items.filter((i) => i.direction === "out");
  const ideas = items.filter((i) => i.kind === "idea");

  const columns: { key: Direction; title: string; icon: typeof IconInbox; list: Item[]; accent: string }[] = [
    { key: "in", title: "Coming In", icon: IconInbox, list: incoming, accent: "text-orange-500" },
    { key: "out", title: "Going Out", icon: IconSend, list: outgoing, accent: "text-neutral-900" },
  ];

  return (
    <div className="space-y-6">
      <Card className="rounded-2xl border-neutral-200 bg-neutral-50 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl font-semibold">
            <IconSwap className="h-5 w-5 text-orange-500" /> Capture
          </CardTitle>
          <CardDescription>
            Log anything coming in, going out, or a new idea
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="e.g. Follow up with supplier about restock"
              className="bg-white"
            />
            <Button
              onClick={add}
              disabled={!text.trim()}
              className="shrink-0 bg-orange-500 text-white hover:bg-orange-600"
            >
              <IconPlus className="mr-2 h-4 w-4" /> Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <ToggleChip active={direction === "in"} onClick={() => setDirection("in")}>
              <IconInbox className="h-3.5 w-3.5" /> In
            </ToggleChip>
            <ToggleChip active={direction === "out"} onClick={() => setDirection("out")}>
              <IconSend className="h-3.5 w-3.5" /> Out
            </ToggleChip>
            <span className="mx-1 w-px bg-neutral-200" />
            <ToggleChip active={kind === "task"} onClick={() => setKind("task")}>
              Task
            </ToggleChip>
            <ToggleChip active={kind === "idea"} onClick={() => setKind("idea")}>
              <IconBulb className="h-3.5 w-3.5" /> Idea
            </ToggleChip>
            <span className="mx-1 w-px bg-neutral-200" />
            {["Ops", "Billing", "Growth", "Legal"].map((t) => (
              <ToggleChip key={t} active={tag === t} onClick={() => setTag(t)}>
                {t}
              </ToggleChip>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {columns.map((col) => (
          <Card key={col.key} className="rounded-2xl border-neutral-200 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <col.icon className={cn("h-5 w-5", col.accent)} /> {col.title}
              </CardTitle>
              <Badge className="border-neutral-200 bg-neutral-100 text-neutral-600">
                {col.list.length}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {col.list.length === 0 && (
                <p className="rounded-lg border border-dashed border-neutral-200 py-6 text-center text-sm text-neutral-400">
                  Nothing here yet
                </p>
              )}
              {col.list.map((i) => (
                <ItemRow key={i.id} item={i} onRemove={remove} />
              ))}
            </CardContent>
          </Card>
        ))}

        <Card className="rounded-2xl border-neutral-900 bg-neutral-950 text-white shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <IconBulb className="h-5 w-5 text-orange-500" /> Ideas
            </CardTitle>
            <Badge className="border-white/10 bg-white/10 text-white">
              {ideas.length}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {ideas.length === 0 && (
              <p className="rounded-lg border border-dashed border-neutral-700 py-6 text-center text-sm text-neutral-500">
                No ideas captured
              </p>
            )}
            {ideas.map((i) => (
              <div
                key={i.id}
                className="group flex items-start gap-2 rounded-lg bg-white/5 px-3 py-2 transition-colors hover:bg-white/10"
              >
                <IconSparkle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
                <p className="flex-1 text-sm text-neutral-200">{i.text}</p>
                <button
                  onClick={() => remove(i.id)}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <IconTrash className="h-3.5 w-3.5 text-neutral-400 hover:text-orange-500" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ItemRow({ item, onRemove }: { item: Item; onRemove: (id: string) => void }) {
  return (
    <div className="group flex items-start gap-2 rounded-xl border border-neutral-100 bg-white px-3 py-2.5 transition-colors hover:border-neutral-200 hover:bg-neutral-50">
      <div className="flex-1">
        <p className="text-sm text-neutral-800">{item.text}</p>
        <div className="mt-1 flex items-center gap-2">
          <Badge className="border-neutral-200 bg-neutral-100 text-xs text-neutral-600">
            {item.tag}
          </Badge>
          {item.kind === "idea" && (
            <span className="flex items-center gap-1 text-xs text-orange-600">
              <IconBulb className="h-3 w-3" /> Idea
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onRemove(item.id)}
        className="opacity-0 transition-opacity group-hover:opacity-100"
      >
        <IconTrash className="h-4 w-4 text-neutral-400 hover:text-orange-500" />
      </button>
    </div>
  );
}

function ToggleChip({
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
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-orange-500 bg-orange-500 text-white"
          : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
      )}
    >
      {children}
    </button>
  );
}