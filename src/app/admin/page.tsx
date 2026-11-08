import { AdminOperations } from "@/components/admin/admin-operations";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export default async function AdminHome() {
  const user = await requireRole("admin");
  const supabase = await createClient();
  const [driverResult, vehicleResult, documentResult, reportResult, accountResult, adminResult] = await Promise.all([
    supabase.from("driver_profiles").select("user_id, verification_status, created_at, verified_at").order("created_at",{ascending:false}),
    supabase.from("vehicles").select("id, driver_id, make, model, registration_number, seat_capacity, vehicle_status").order("created_at",{ascending:false}),
    supabase.from("driver_documents").select("id, driver_id, document_type, storage_path, verification_status, rejection_reason, created_at").order("created_at",{ascending:false}),
    supabase.from("reports").select("id, reporter_id, reported_user_id, category, description, report_status, created_at").order("created_at",{ascending:false}).limit(50),
    supabase.from("profiles").select("id, full_name, account_status").order("created_at",{ascending:false}).limit(200),
    supabase.from("admin_profiles").select("user_id, admin_role"),
  ]);

  const driverIds = new Set((driverResult.data ?? []).map((driver) => driver.user_id));
  const adminIds = new Set((adminResult.data ?? []).map((admin) => admin.user_id));
  const accounts = (accountResult.data ?? []).map((account) => ({
    ...account,
    role: adminIds.has(account.id) ? "admin" : driverIds.has(account.id) ? "driver" : "passenger",
  }));
  const names = Object.fromEntries(accounts.map((account) => [account.id,account.full_name]));


  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-medium text-teal-800">Administrator workspace · {user.adminRole}</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">Operations overview</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Review driver applications, verify private documents and manage reports according to your assigned administrator permissions.</p>
      </section>
      <AdminOperations
        adminRole={user.adminRole}
        drivers={driverResult.data ?? []}
        vehicles={vehicleResult.data ?? []}
        documents={documentResult.data ?? []}
        reports={reportResult.data ?? []}
        names={names}
        accounts={accounts}
        currentAdminId={user.id}
      />
    </div>
  );
}
