import { AuthShell } from "@/components/auth/auth-shell";
import { requestPasswordResetAction } from "@/app/auth/actions";

export default function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return (
    <AuthShell title="Reset your password" description="Enter the email address on your EmbuRide account. If it is registered, we will send a secure password-reset link.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}

function ForgotPasswordForm() {
  return (
    <form action={requestPasswordResetAction} className="mt-8 space-y-5">
      <label className="block text-sm font-medium text-slate-700">Email address
        <input name="email" type="email" required autoComplete="email" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-4 text-base" />
      </label>
      <button type="submit" className="min-h-11 w-full rounded-xl bg-teal-800 px-5 py-3 font-semibold text-white hover:bg-teal-900">Send reset link</button>
      <p className="text-center text-sm text-slate-600"><a href="/login" className="font-semibold text-teal-800 underline">Back to sign in</a></p>
    </form>
  );
}
