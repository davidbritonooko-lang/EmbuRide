"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signInAction, signUpAction } from "@/app/auth/actions";

type Props = { mode: "login" | "signup" };

export function AuthForm({ mode }: Props) {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const isSignup = mode === "signup";

  const errorMessage = error === "missing"
    ? "Enter your email address and password."
    : error === "invalid"
      ? "Enter your name, a valid email, and a password of at least 10 characters."
      : error === "callback"
        ? "The sign-in link could not be verified. Please try again."
        : error === "profile"
          ? "Your account profile is not ready. Contact support."
          : error
            ? error
            : null;

  return (
    <form action={isSignup ? signUpAction : signInAction} className="mt-8 space-y-5">
      {isSignup && (
        <div>
          <label htmlFor="fullName" className="mb-2 block text-sm font-medium text-slate-700">Full name</label>
          <input id="fullName" name="fullName" type="text" autoComplete="name" required minLength={2} maxLength={120}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
        </div>
      )}
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">Email address</label>
        <input id="email" name="email" type="email" autoComplete="email" required
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
      </div>
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">Password</label>
        <input id="password" name="password" type="password" autoComplete={isSignup ? "new-password" : "current-password"} required minLength={isSignup ? 10 : 1}
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
        {isSignup && <p className="mt-2 text-xs text-slate-500">Use at least 10 characters.</p>}
      </div>
      {errorMessage && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{errorMessage}</p>}
      <button type="submit" className="w-full rounded-xl bg-teal-700 px-5 py-3 font-semibold text-white transition hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2">
        {isSignup ? "Create account" : "Sign in"}
      </button>
      <p className="text-center text-sm text-slate-600">
        {isSignup ? "Already registered? " : "New to EmbuRide? "}
        <Link className="font-semibold text-teal-800 underline-offset-4 hover:underline" href={isSignup ? "/login" : "/signup"}>
          {isSignup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
