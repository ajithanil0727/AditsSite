import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Tone = "sky" | "lavender" | "mint" | "peach" | "neutral" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  sky: "bg-sky text-sky-foreground",
  lavender: "bg-lavender text-lavender-foreground",
  mint: "bg-mint text-mint-foreground",
  peach: "bg-peach text-peach-foreground",
  neutral: "bg-secondary text-secondary-foreground",
  danger: "bg-destructive/15 text-destructive",
};

export function toTone(value: string | null | undefined): Tone {
  return value && value in TONE_CLASS ? (value as Tone) : "neutral";
}

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return <Badge className={cn(TONE_CLASS[tone], className)}>{children}</Badge>;
}

/** Common document statuses. */
export const DOC_STATUS: Record<string, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  POSTED: { label: "Posted", tone: "mint" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
  DISPATCHED: { label: "In transit", tone: "peach" },
  RECEIVED: { label: "Received", tone: "mint" },
  ISSUED: { label: "Issued", tone: "mint" },
  PENDING: { label: "Pending", tone: "peach" },
  REJECTED: { label: "Rejected", tone: "danger" },
  SENT: { label: "Sent", tone: "sky" },
  APPROVED: { label: "Approved", tone: "mint" },
  EXPIRED: { label: "Expired", tone: "neutral" },
};

export function DocStatus({ status }: { status: string }) {
  const s = DOC_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}
