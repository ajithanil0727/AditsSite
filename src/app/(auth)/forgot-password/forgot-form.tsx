"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/modules/portal/portal-auth.actions";

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await forgotPasswordAction({ email });
          setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
        });
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      {msg && (
        <p
          role="status"
          className={msg.ok ? "rounded-md bg-mint px-3 py-2 text-sm text-mint-foreground" : "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"}
        >
          {msg.text}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-muted-foreground underline hover:text-foreground">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
