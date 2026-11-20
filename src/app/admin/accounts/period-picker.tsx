"use client";

import { useUrlState } from "@/components/data-table/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Range = { from: string; to: string };

export function PeriodPicker({
  from,
  to,
  presets,
  children,
}: {
  from: string;
  to: string;
  presets: { thisMonth: Range; lastMonth: Range; thisFy: Range; lastFy: Range };
  children?: React.ReactNode;
}) {
  const { set, pending } = useUrlState();
  const options: [string, Range][] = [
    ["This month", presets.thisMonth],
    ["Last month", presets.lastMonth],
    ["This FY", presets.thisFy],
    ["Last FY", presets.lastFy],
  ];
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3" aria-busy={pending}>
      <div className="flex flex-wrap gap-1">
        {options.map(([label, r]) => (
          <Button
            key={label}
            type="button"
            size="sm"
            variant={r.from === from && r.to === to ? "secondary" : "ghost"}
            onClick={() => set({ from: r.from, to: r.to })}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-from">From</Label>
        <Input
          id="p-from"
          type="date"
          value={from}
          max={to}
          onChange={(e) => e.target.value && set({ from: e.target.value })}
          className="w-40"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-to">To</Label>
        <Input
          id="p-to"
          type="date"
          value={to}
          min={from}
          onChange={(e) => e.target.value && set({ to: e.target.value })}
          className="w-40"
        />
      </div>
      <div className={cn("ml-auto flex flex-wrap gap-2")}>{children}</div>
    </div>
  );
}
