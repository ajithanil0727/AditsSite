import { Suspense } from "react";
import { PrintBar } from "./print-bar";

// Print views: no admin chrome. Each page checks the user's permission itself.
export const instant = false;

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-muted/40 py-4 print:bg-transparent print:py-0">
      <PrintBar />
      <Suspense fallback={<p className="p-8 text-center text-muted-foreground">Loading…</p>}>{children}</Suspense>
    </div>
  );
}
