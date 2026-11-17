"use client";

import { GitBranchIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setActiveBranch } from "@/modules/branches/branch-switcher.actions";

export function BranchSwitcher({
  branches,
  activeBranchId,
  allLabel,
}: {
  branches: { id: string; code: string; name: string }[];
  activeBranchId: string | null;
  allLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  if (branches.length === 0) return null;

  // A user with exactly one branch has nothing to switch.
  if (branches.length === 1) {
    return (
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <GitBranchIcon className="size-4" /> {branches[0].name}
      </span>
    );
  }

  return (
    <Select
      value={activeBranchId ?? "all"}
      disabled={pending}
      onValueChange={(branchId) =>
        startTransition(async () => {
          const res = await setActiveBranch({ branchId });
          if (!res.ok) toast.error(res.error);
        })
      }
    >
      <SelectTrigger className="w-[min(14rem,45vw)]" aria-label="Branch">
        <GitBranchIcon className="size-4 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
