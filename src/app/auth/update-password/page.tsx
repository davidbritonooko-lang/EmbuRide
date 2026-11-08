import { AuthShell } from "@/components/auth/auth-shell";
import { updatePasswordAction } from "@/app/auth/actions";

export default function UpdatePasswordPage() {
  return (
    <AuthShell title="Choose a new password" description="Use at least 10 characters. This updates the password for your EmbuRide account.">
      <form action={updatePasswordAction} className="mt-8 space-y-5">
        <label className="block text-sm font-medium text-slate-700">New password
          <input name="password" type="password" required minLength={10} autoComplete="new-password" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-4 text-base" />
        </label>
        <label className="block text-sm font-medium text-slate-700">Confirm new password
          <input name="confirmation" type="password" required minLength={10} autoComplete="new-password" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-4 text-base" />
        </label>
        <button type="submit" className="min-h-11 w-full rounded-xl bg-teal-800 px-5 py-3 font-semibold text-white hover:bg-teal-900">Update password</button>
      </form>
    </AuthShell>
  );
}
