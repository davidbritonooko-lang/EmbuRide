import { Suspense } from "react";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" description="Sign in to continue to your EmbuRide account.">
      <Suspense fallback={<div className="mt-8 h-56 animate-pulse rounded-xl bg-slate-100" />}>
        <AuthForm mode="login" />
      </Suspense>
    </AuthShell>
  );
}
