import { requireRole } from "@/lib/auth/server";

export default async function DriverHome() {
  const user = await requireRole("driver");
  const verified = user.driverVerificationStatus === "verified";

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <p className="text-sm font-medium text-teal-800">Driver workspace</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Driver account</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">
        {verified
          ? "Your driver profile is verified. Driver tools will be enabled in the next implementation stage."
          : `Your verification status is ${user.driverVerificationStatus ?? "pending"}. You cannot accept ride requests until verification is complete.`}
      </p>
    </section>
  );
}
