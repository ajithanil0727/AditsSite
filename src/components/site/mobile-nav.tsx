"use client";

import { MenuIcon } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { SmartLink } from "./site-ui";

type Item = { id: string; label: string; href: string; children: { id: string; label: string; href: string }[] };

export function MobileNav({ items, cta }: { items: Item[]; cta: { label: string; href: string } | null }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open menu"
          className="flex size-9 items-center justify-center rounded-full hover:bg-accent lg:hidden"
        >
          <MenuIcon className="size-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav aria-label="Mobile" className="grid gap-1 px-4">
          {items
            .flatMap((i) => [i, ...i.children.map((c) => ({ ...c, child: true }))])
            .map((i) => (
              <SmartLink
                key={i.id}
                href={i.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-lg px-3 py-2.5 font-medium hover:bg-accent",
                  "child" in i && "pl-7 text-sm text-muted-foreground",
                )}
              >
                {i.label}
              </SmartLink>
            ))}
          {cta && (
            <SmartLink
              href={cta.href}
              onClick={() => setOpen(false)}
              className="mt-4 rounded-full bg-primary px-4 py-3 text-center font-semibold text-primary-foreground"
            >
              {cta.label}
            </SmartLink>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
