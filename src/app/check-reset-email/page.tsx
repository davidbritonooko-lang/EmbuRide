import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";

export default function CheckResetEmailPage() {
  return (
    <AuthShell title="Check your email" description="If an account matches that email address, a secure password-reset link has been sent. The link expires according to your authentication settings.">
      <div className="mt-8 text-center">
        <Link href="/login" className="font-semibold text-teal-800 underline underline-offset-4">Return to sign in</Link>
      </div>
    </AuthShell>
  );
}
