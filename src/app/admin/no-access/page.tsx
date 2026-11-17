import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "No access" };

export default function NoAccessPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-peach text-peach-foreground">
        <ShieldAlertIcon className="size-7" />
      </span>
      <h1 className="text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="text-sm text-muted-foreground">Ask an administrator to give your role the required permission.</p>
      <Button asChild variant="outline">
        <Link href="/admin">Back to dashboard</Link>
      </Button>
    </div>
  );
}
