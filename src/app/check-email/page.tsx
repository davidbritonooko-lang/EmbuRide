import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";

export default function CheckEmailPage() {
  return (
    <AuthShell title="Check your email" description="If email confirmation is enabled, Supabase has sent a verification link to your inbox.">
      <p className="mt-8 text-sm leading-6 text-slate-600">Open the message and follow its link to verify your address. You will then be redirected back to EmbuRide.</p>
      <Link href="/login" className="mt-6 inline-flex font-semibold text-teal-800 hover:underline">Return to sign in</Link>
    </AuthShell>
  );
}
