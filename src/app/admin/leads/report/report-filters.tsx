"use client";

import { useUrlState } from "@/components/data-table/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ReportFilters({ from, to, type }: { from: string; to: string; type: string | null }) {
  const { set, pending } = useUrlState();
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3" aria-busy={pending}>
      <div className="grid gap-1.5">
        <Label htmlFor="from">From</Label>
        <Input
          id="from"
          type="date"
          value={from}
          max={to}
          onChange={(e) => e.target.value && set({ from: e.target.value })}
          className="w-40"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="to">To</Label>
        <Input
          id="to"
          type="date"
          value={to}
          min={from}
          onChange={(e) => e.target.value && set({ to: e.target.value })}
          className="w-40"
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Type</Label>
        <Select value={type ?? "all"} onValueChange={(v) => set({ type: v === "all" ? null : v })}>
          <SelectTrigger className="w-40" aria-label="Type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Course & repair</SelectItem>
            <SelectItem value="COURSE">Course</SelectItem>
            <SelectItem value="SERVICE">Repair</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
