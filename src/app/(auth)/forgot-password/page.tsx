import type { Metadata } from "next";
import { AuthCard } from "../auth-card";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <AuthCard title="Forgot your password?" description="We'll email you a link to set a new one.">
      <ForgotForm />
    </AuthCard>
  );
}
