"use client";

import {
  BoldIcon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Markdown } from "@/components/cms/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Tool = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  apply: (sel: string) => [string, string, string];
};

/** [before, text, after] around the selection. */
const TOOLS: Tool[] = [
  { icon: BoldIcon, label: "Bold", apply: (s) => ["**", s || "bold text", "**"] },
  { icon: ItalicIcon, label: "Italic", apply: (s) => ["_", s || "italic text", "_"] },
  { icon: Heading2Icon, label: "Heading", apply: (s) => ["\n## ", s || "Heading", "\n"] },
  { icon: Heading3Icon, label: "Small heading", apply: (s) => ["\n### ", s || "Small heading", "\n"] },
  {
    icon: ListIcon,
    label: "Bulleted list",
    apply: (s) => [
      "\n",
      (s || "Item")
        .split("\n")
        .map((l) => `- ${l}`)
        .join("\n"),
      "\n",
    ],
  },
  {
    icon: ListOrderedIcon,
    label: "Numbered list",
    apply: (s) => [
      "\n",
      (s || "Item")
        .split("\n")
        .map((l, i) => `${i + 1}. ${l}`)
        .join("\n"),
      "\n",
    ],
  },
  { icon: QuoteIcon, label: "Quote", apply: (s) => ["\n> ", s || "Quote", "\n"] },
  { icon: LinkIcon, label: "Link", apply: (s) => ["[", s || "link text", "](/contact)"] },
];

/** A plain textarea with a formatting toolbar and a live preview. Stores Markdown. */
export function MarkdownEditor({
  id,
  value,
  onChange,
  invalid,
  rows = 10,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");

  const apply = (tool: Tool) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const [before, text, after] = tool.apply(value.slice(a, b));
    const next = value.slice(0, a) + before + text + after + value.slice(b);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + before.length, a + before.length + text.length);
    });
  };

  return (
    <div className={cn("overflow-hidden rounded-md border", invalid && "border-destructive")}>
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1">
        {TOOLS.map((t) => (
          <Button
            key={t.label}
            type="button"
            variant="ghost"
            size="icon-sm"
            title={t.label}
            aria-label={t.label}
            disabled={tab === "preview"}
            onClick={() => apply(t)}
          >
            <t.icon className="size-4" />
          </Button>
        ))}
        <div className="ml-auto flex rounded-md bg-background p-0.5 text-xs">
          {(["write", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "rounded px-2 py-1 capitalize",
                tab === t ? "bg-secondary font-medium" : "text-muted-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {tab === "write" ? (
        <Textarea
          id={id}
          ref={ref}
          rows={rows}
          value={value}
          aria-invalid={invalid}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-none border-0 font-mono text-sm shadow-none focus-visible:ring-0"
        />
      ) : (
        <div className="min-h-40 p-4">
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground">Nothing to preview.</p>
          )}
        </div>
      )}
    </div>
  );
}
