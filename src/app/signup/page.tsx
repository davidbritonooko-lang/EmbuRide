import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export default function SignupPage() {
  return (
    <AuthShell title="Create your account" description="Register to discover and request rides across Embu County.">
      <Suspense fallback={<div className="mt-8 h-64 animate-pulse rounded-xl bg-slate-100" />}>
        <AuthForm mode="signup" />
      </Suspense>
    </AuthShell>
  );
}
