import { AuthShell } from "@/components/auth/auth-shell";
import { UpdatePasswordForm } from "@/components/auth/password-reset-forms";

export default function UpdatePasswordPage() {
  return (
    <AuthShell title="Choose a new password" description="Use at least 10 characters. This updates the password for your EmbuRide account.">
      <UpdatePasswordForm />
    </AuthShell>
  );
}
