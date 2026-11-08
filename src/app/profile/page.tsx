import Link from "next/link";
import { ProfileForm } from "@/components/profile/profile-form";
import { requireUserContext } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUserContext();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_own_profile");
  const profile = data?.[0];

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/dashboard" className="text-sm font-semibold text-teal-800 underline underline-offset-4">← Back to workspace</Link>
        <header className="mb-7 mt-6">
          <p className="text-sm font-semibold text-teal-800">ACCOUNT SETTINGS</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Your profile</h1>
          <p className="mt-2 text-sm text-slate-600">Update the details used for your EmbuRide account and confirmed bookings.</p>
        </header>
        <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account email</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{user.email ?? "Not available"}</p>
        </div>
        <ProfileForm initialName={profile?.full_name ?? user.fullName} initialPhone={profile?.phone ?? null} />
      </div>
    </main>
  );
}
