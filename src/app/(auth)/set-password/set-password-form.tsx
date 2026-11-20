"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPasswordAction } from "@/modules/portal/portal-auth.actions";

export function SetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (done)
    return (
      <div className="space-y-4 text-center text-sm">
        <p>Your password is set. Sign in with {done}.</p>
        <Button asChild className="w-full">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await setPasswordAction({ token, password, confirm });
          if (r.ok) setDone(r.message);
          else setError(r.error);
        });
      }}
    >
      <div className="grid gap-2">
        <Label htmlFor="pw">New password</Label>
        <Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <p className="text-xs text-muted-foreground">At least 8 characters, with a letter and a number.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pw2">Type it again</Label>
        <Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      {error && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}
