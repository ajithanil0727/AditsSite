"use client";

import { SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Header search box: opens the search page. Names, phone numbers, job / invoice / receipt numbers. */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim().length >= 2) router.push(`/admin/search?q=${encodeURIComponent(q.trim())}`);
      }}
      className="relative hidden md:block"
    >
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name, phone, job no…"
        aria-label="Search"
        className="h-9 w-56 rounded-md border bg-background pr-2 pl-8 text-sm lg:w-72"
      />
    </form>
  );
}
