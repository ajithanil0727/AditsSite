import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard } from "../auth-card";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Set your password", robots: { index: false } };

async function Gate({ searchParams }: { searchParams: PageProps<"/set-password">["searchParams"] }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  if (!token) return <p className="text-sm text-muted-foreground">Open the link from your email.</p>;
  return <SetPasswordForm token={token} />;
}

export default function SetPasswordPage(props: PageProps<"/set-password">) {
  return (
    <AuthCard title="Set your password" description="Choose a password for your account.">
      <Suspense fallback={null}>
        <Gate searchParams={props.searchParams} />
      </Suspense>
    </AuthCard>
  );
}
