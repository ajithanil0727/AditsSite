"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type PickerPart = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  onHand: number | null;
  salePrice?: number | null;
};

/** Searchable part combobox (by name or SKU). Shows stock on hand when known. */
export function PartPicker({
  parts,
  value,
  onChange,
  placeholder = "Select a part",
  invalid,
}: {
  parts: PickerPart[];
  value: string | null;
  onChange: (part: PickerPart) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = parts.find((p) => p.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.name} (${selected.sku})` : placeholder}
          </span>
          <ChevronsUpDownIcon className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(32rem,90vw)] p-0" align="start">
        <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search name or SKU…" />
          <CommandList>
            <CommandEmpty>No part found.</CommandEmpty>
            <CommandGroup>
              {parts.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`${p.name} ${p.sku}`}
                  onSelect={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                >
                  <CheckIcon className={cn("size-4", value === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1 truncate">
                    {p.name} <span className="text-xs text-muted-foreground">{p.sku}</span>
                  </span>
                  {p.onHand !== null && (
                    <span className={cn("text-xs", p.onHand > 0 ? "text-muted-foreground" : "text-destructive")}>
                      {p.onHand} {p.unit}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
