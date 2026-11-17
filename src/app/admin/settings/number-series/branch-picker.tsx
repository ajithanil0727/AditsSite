"use client";

import { useUrlState } from "@/components/data-table/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function BranchPicker({ branches, value }: { branches: { id: string; name: string }[]; value: string }) {
  const { set } = useUrlState();
  return (
    <Select value={value} onValueChange={(v) => set({ branch: v })}>
      <SelectTrigger className="w-56" aria-label="Branch">
        <SelectValue placeholder="Select branch" />
      </SelectTrigger>
      <SelectContent>
        {branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
