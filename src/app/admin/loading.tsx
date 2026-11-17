import { Skeleton } from "@/components/ui/skeleton";

/** Shown instantly while an admin page loads its (per-user) data. */
export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-6 h-4 w-80" />
      <div className="space-y-2">
        <Skeleton className="h-9 w-full max-w-xs" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  );
}
