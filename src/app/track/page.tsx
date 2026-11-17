import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { TrackForm } from "./track-form";

export const metadata: Metadata = {
  title: "Track your repair",
  description: "Check the status of your device repair with your job card number and phone number.",
};

// Simple public page until the full website (Phase 4).
export default function TrackPage() {
  return (
    <main className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between p-4">
        <Link href="/" className="font-semibold">
          ← Home
        </Link>
        <ThemeToggle />
      </header>
      <section className="mx-auto w-full max-w-xl flex-1 px-4 pb-12">
        <h1 className="text-3xl font-bold tracking-tight">Track your repair</h1>
        <p className="mt-2 text-muted-foreground">
          Enter the job number from your job card and the phone number you gave us.
        </p>
        <div className="mt-6">
          <TrackForm />
        </div>
      </section>
    </main>
  );
}
