import { AuthShell } from "@/components/auth/auth-shell";

export default function UnavailableAccountPage() {
  return (
    <AuthShell title="Account unavailable" description="This account is not currently active. Contact EmbuRide support if you believe this is an error.">
      <form action="/auth/sign-out" method="post" className="mt-8">
        <button className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white">Sign out</button>
      </form>
    </AuthShell>
  );
}
