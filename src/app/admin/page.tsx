import { AdminOperations } from "@/components/admin/admin-operations";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export default async function AdminHome() {
  const user = await requireRole("admin");
  const supabase = await createClient();
  const [driverResult, vehicleResult, documentResult, reportResult] = await Promise.all([
    supabase.from("driver_profiles").select("user_id, verification_status, created_at, verified_at").order("created_at",{ascending:false}),
    supabase.from("vehicles").select("id, driver_id, make, model, registration_number, seat_capacity, vehicle_status").order("created_at",{ascending:false}),
    supabase.from("driver_documents").select("id, driver_id, document_type, storage_path, verification_status, rejection_reason, created_at").order("created_at",{ascending:false}),
    supabase.from("reports").select("id, reporter_id, reported_user_id, category, description, report_status, created_at").order("created_at",{ascending:false}).limit(50),
  ]);

  const userIds = [...new Set([
    ...(driverResult.data ?? []).map((driver) => driver.user_id),
    ...(reportResult.data ?? []).flatMap((report) => [report.reporter_id, report.reported_user_id]),
  ])];
  const profileResult = userIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id",userIds)
    : { data: [] };
  const names = Object.fromEntries((profileResult.data ?? []).map((profile) => [profile.id,profile.full_name]));

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
      />
    </div>
  );
}
