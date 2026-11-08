import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/password-reset-forms";

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password" description="Enter the email address on your EmbuRide account. If it is registered, we will send a secure password-reset link.">
      <Suspense fallback={<p className="mt-8 text-sm text-slate-600">Loading password form…</p>}><ForgotPasswordForm /></Suspense>
    </AuthShell>
  );
}
