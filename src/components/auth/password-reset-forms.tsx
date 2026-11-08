"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { requestPasswordResetAction, updatePasswordAction } from "@/app/auth/actions";

export function ForgotPasswordForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const message = error === "invalid"
    ? "Enter a valid email address."
    : error === "request"
      ? "The reset request could not be completed. Please try again later."
      : null;

  return (
    <form action={requestPasswordResetAction} className="mt-8 space-y-5">
      <label className="block text-sm font-medium text-slate-700">Email address
        <input name="email" type="email" required autoComplete="email" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-4 text-base" />
      </label>
      {message && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{message}</p>}
      <button type="submit" className="min-h-11 w-full rounded-xl bg-teal-800 px-5 py-3 font-semibold text-white hover:bg-teal-900">Send reset link</button>
      <p className="text-center text-sm text-slate-600"><Link href="/login" className="font-semibold text-teal-800 underline">Back to sign in</Link></p>
    </form>
  );
}

export function UpdatePasswordForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const message = error === "invalid"
    ? "Passwords must match and contain at least 10 characters."
    : error === "update"
      ? "The password could not be updated. Request a new reset link and try again."
      : null;

  return (
    <form action={updatePasswordAction} className="mt-8 space-y-5">
      <label className="block text-sm font-medium text-slate-700">New password
        <input name="password" type="password" required minLength={10} autoComplete="new-password" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-4 text-base" />
      </label>
      <label className="block text-sm font-medium text-slate-700">Confirm new password
        <input name="confirmation" type="password" required minLength={10} autoComplete="new-password" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-4 text-base" />
      </label>
      {message && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{message}</p>}
      <button type="submit" className="min-h-11 w-full rounded-xl bg-teal-800 px-5 py-3 font-semibold text-white hover:bg-teal-900">Update password</button>
    </form>
  );
}
