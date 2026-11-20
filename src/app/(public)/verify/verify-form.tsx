"use client";

import { SearchIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { CertificateResult } from "@/components/site/certificate-result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyByNumber, type VerifyResult } from "@/modules/academics/verify.actions";

export function VerifyForm() {
  const [number, setNumber] = useState("");
  const [issuedOn, setIssuedOn] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setResult(await verifyByNumber({ number, issuedOn })));
        }}
        className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
      >
        <div className="grid gap-2">
          <Label htmlFor="certNo">Certificate number</Label>
          <Input
            id="certNo"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="PKD/CERT/26-27/00001"
            required
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="issuedOn">Issued on</Label>
          <Input id="issuedOn" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} required />
        </div>
        <Button type="submit" disabled={pending}>
          <SearchIcon /> {pending ? "Checking…" : "Verify"}
        </Button>
      </form>
      {result && !result.ok && (
        <p role="alert" className="rounded-md bg-peach px-3 py-2 text-sm text-peach-foreground">
          {result.error}
        </p>
      )}
      {result?.ok && <CertificateResult c={result.certificate} />}
    </div>
  );
}
