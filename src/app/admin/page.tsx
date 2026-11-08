import { requireRole } from "@/lib/auth/server";

export default async function AdminHome() {
  const user = await requireRole("admin");
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
      <p className="text-sm font-medium text-teal-800">Administrator workspace</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-950">Operations overview</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Your assigned administrative role is {user.adminRole}. Administrative tools will be implemented in a later stage.</p>
    </section>
  );
}
