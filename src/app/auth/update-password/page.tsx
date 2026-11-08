import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { UpdatePasswordForm } from "@/components/auth/password-reset-forms";

export default function UpdatePasswordPage() {
  return (
    <AuthShell title="Choose a new password" description="Use at least 10 characters. This updates the password for your EmbuRide account.">
      <Suspense fallback={<p className="mt-8 text-sm text-slate-600">Loading password form…</p>}><UpdatePasswordForm /></Suspense>
    </AuthShell>
  );
}
