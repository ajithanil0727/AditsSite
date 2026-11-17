"use client";

import { PrinterIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintBar() {
  return (
    <div className="no-print mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4">
      <Button variant="outline" onClick={() => window.close()}>
        <XIcon /> Close
      </Button>
      <Button onClick={() => window.print()}>
        <PrinterIcon /> Print / Save as PDF
      </Button>
    </div>
  );
}
