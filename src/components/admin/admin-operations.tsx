"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AdminRole } from "@/lib/auth/types";

type Driver = { user_id: string; verification_status: string; created_at: string; verified_at: string | null };
type Vehicle = { id: string; driver_id: string; make: string; model: string; registration_number: string; seat_capacity: number; vehicle_status: string };
type DriverDocument = { id: string; driver_id: string; document_type: string; storage_path: string; verification_status: string; rejection_reason: string | null; created_at: string };
type Report = { id: string; reporter_id: string; reported_user_id: string; category: string; description: string; report_status: string; created_at: string };
type Account = { id: string; full_name: string; account_status: string; role: string };

const requiredTypes = ["national_id", "driving_licence", "vehicle_registration", "vehicle_insurance"];

export function AdminOperations({
  adminRole,
  drivers,
  vehicles,
  documents,
  reports,
  names,
  accounts,
  currentAdminId,
}: {
  adminRole: AdminRole | null;
  drivers: Driver[];
  vehicles: Vehicle[];
  documents: DriverDocument[];
  reports: Report[];
  names: Record<string, string>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const canVerify = adminRole === "super_admin" || adminRole === "verification_admin";
  const canSupport = canVerify || adminRole === "operations_admin" || adminRole === "support_admin";
  const canManageAccounts = adminRole === "super_admin";
  const [busy, setBusy] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [fileLinks, setFileLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function runAction(key: string, action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(key); setError(null); setNotice(null);
    const result = await action();
    setBusy(null);
    if (result.error) {
      setError("The change was not saved. Check the required documents, permissions and review reason.");
      return;
    }
    setNotice("The administrative action was saved and recorded in the audit log.");
    router.refresh();
  }

  async function openDocument(document: DriverDocument) {
    setBusy(`file-${document.id}`);
    setError(null);
    const { data, error: fileError } = await supabase.storage
      .from("driver-documents")
      .createSignedUrl(document.storage_path, 60);
    setBusy(null);
    if (fileError || !data?.signedUrl) {
      setError("The private document could not be opened.");
      return;
    }
    setFileLinks((current) => ({ ...current, [document.id]: data.signedUrl }));
  }

  function driverReady(driverId: string) {
    const approvedTypes = new Set(
      documents.filter((doc) => doc.driver_id === driverId && doc.verification_status === "approved").map((doc) => doc.document_type)
    );
    const hasAllDocs = requiredTypes.every((type) => approvedTypes.has(type));
    const hasVehicle = vehicles.some((vehicle) => vehicle.driver_id === driverId && vehicle.vehicle_status === "approved");
    return hasAllDocs && hasVehicle;
  }

  const pendingDrivers = drivers.filter((driver) => driver.verification_status !== "verified");
  const openReports = reports.filter((report) => report.report_status === "open" || report.report_status === "reviewing");

  return (
    <div className="space-y-7">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Driver applications", drivers.length],
          ["Awaiting verification", pendingDrivers.length],
          ["Registered vehicles", vehicles.length],
          ["Open reports", openReports.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">{label}</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</p>}

      {canManageAccounts && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div>
            <p className="text-sm font-semibold text-teal-800">Super administrator</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Account access controls</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Suspend or close accounts with a recorded reason. Closed accounts cannot be reactivated through this control.</p>
          </div>
          {accounts.length === 0 ? <p className="mt-4 text-sm text-slate-600">No user accounts found.</p> : (
            <div className="mt-4 space-y-3">
              {accounts.map((account) => (
                <article key={account.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div><h3 className="font-semibold text-slate-900">{account.full_name}</h3><p className="mt-1 text-xs text-slate-500">{account.role.replaceAll("_"," ")} · {account.id.slice(0,8)}</p></div>
                    <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">{account.account_status}</span>
                  </div>
                  {account.id !== currentAdminId && (
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <select value={accountStatuses[account.id] ?? account.account_status} onChange={(event) => setAccountStatuses((current) => ({...current,[account.id]:event.target.value}))} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">
                        <option value="active">Active</option><option value="suspended">Suspended</option><option value="closed">Closed</option>
                      </select>
                      <input value={reasons[`account-${account.id}`] ?? ""} onChange={(event) => setReasons((current) => ({...current,[`account-${account.id}`]:event.target.value}))} placeholder="Reason for change" className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm" />
                      <button type="button" disabled={busy === `account-${account.id}` || (reasons[`account-${account.id}`] ?? "").trim().length < 3 || (accountStatuses[account.id] ?? account.account_status) === account.account_status} onClick={() => void runAction(`account-${account.id}`,() => supabase.rpc("admin_set_account_status",{p_user_id:account.id,p_next_status:accountStatuses[account.id] ?? account.account_status,p_reason:reasons[`account-${account.id}`]}))} className="min-h-10 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save access</button>
                    </div>
                  )}
                  {account.id === currentAdminId && <p className="text-xs text-slate-500">Your own administrator account is protected from this control.</p>}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {canVerify && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div>
            <p className="text-sm font-semibold text-teal-800">Verification queue</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Driver applications and documents</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Review each required document and vehicle before approving a driver. Approval decisions are audit logged.</p>
          </div>

          {drivers.length === 0 ? <p className="mt-4 text-sm text-slate-600">No driver applications have been submitted.</p> : (
            <div className="mt-5 space-y-5">
              {drivers.map((driver) => {
                const driverDocs = documents.filter((doc) => doc.driver_id === driver.user_id);
                const driverVehicles = vehicles.filter((vehicle) => vehicle.driver_id === driver.user_id);
                const ready = driverReady(driver.user_id);
                return (
                  <article key={driver.user_id} className="rounded-xl border border-slate-200 p-4 sm:p-5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-950">{names[driver.user_id] ?? "Driver account"}</h3>
                        <p className="mt-1 text-xs text-slate-500">Submitted {new Date(driver.created_at).toLocaleString("en-KE")}</p>
                      </div>
                      <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">{driver.verification_status.replaceAll("_"," ")}</span>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-2">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-800">Documents</h4>
                        {driverDocs.length === 0 ? <p className="mt-2 text-xs text-slate-500">No documents uploaded.</p> : (
                          <div className="mt-2 space-y-2">
                            {driverDocs.map((doc) => (
                              <div key={doc.id} className="rounded-lg bg-slate-50 p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div><p className="text-sm font-medium capitalize text-slate-800">{doc.document_type.replaceAll("_"," ")}</p><p className="text-xs capitalize text-slate-500">{doc.verification_status}</p></div>
                                  <button type="button" disabled={busy === `file-${doc.id}`} onClick={() => void openDocument(doc)} className="text-xs font-semibold text-teal-800 underline underline-offset-4">{busy === `file-${doc.id}` ? "Preparing…" : "Open private file"}</button>
                                </div>
                                {fileLinks[doc.id] && <a href={fileLinks[doc.id]} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-teal-800 underline">View document (60-second link)</a>}
                                {doc.verification_status === "pending" && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <button type="button" disabled={busy === `doc-${doc.id}`} onClick={() => void runAction(`doc-${doc.id}`, () => supabase.rpc("admin_review_driver_document",{p_document_id:doc.id,p_next_status:"approved",p_reason:null}))} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve document</button>
                                    <button type="button" disabled={busy === `doc-${doc.id}` || (reasons[doc.id] ?? "").trim().length < 3} onClick={() => void runAction(`doc-${doc.id}`, () => supabase.rpc("admin_review_driver_document",{p_document_id:doc.id,p_next_status:"rejected",p_reason:reasons[doc.id]}))} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-800 disabled:opacity-50">Reject</button>
                                  </div>
                                )}
                                {doc.verification_status === "pending" && <input aria-label={`Rejection reason for ${doc.document_type}`} value={reasons[doc.id] ?? ""} onChange={(event) => setReasons((current) => ({...current,[doc.id]:event.target.value}))} placeholder="Reason if rejecting" className="mt-2 min-h-9 w-full rounded-lg border border-slate-300 px-3 text-xs" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h4 className="text-sm font-semibold text-slate-800">Vehicles</h4>
                        {driverVehicles.length === 0 ? <p className="mt-2 text-xs text-slate-500">No vehicles registered.</p> : (
                          <div className="mt-2 space-y-2">
                            {driverVehicles.map((vehicle) => (
                              <div key={vehicle.id} className="rounded-lg bg-slate-50 p-3">
                                <p className="text-sm font-semibold text-slate-900">{vehicle.make} {vehicle.model}</p>
                                <p className="mt-1 text-xs text-slate-600">{vehicle.registration_number} · {vehicle.seat_capacity} seats · {vehicle.vehicle_status}</p>
                                {vehicle.vehicle_status === "pending" && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <button type="button" disabled={busy === `vehicle-${vehicle.id}`} onClick={() => void runAction(`vehicle-${vehicle.id}`, () => supabase.rpc("admin_review_vehicle",{p_vehicle_id:vehicle.id,p_next_status:"approved",p_reason:null}))} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Approve vehicle</button>
                                    <button type="button" disabled={busy === `vehicle-${vehicle.id}` || (reasons[vehicle.id] ?? "").trim().length < 3} onClick={() => void runAction(`vehicle-${vehicle.id}`, () => supabase.rpc("admin_review_vehicle",{p_vehicle_id:vehicle.id,p_next_status:"rejected",p_reason:reasons[vehicle.id]}))} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-800 disabled:opacity-50">Reject</button>
                                  </div>
                                )}
                                {vehicle.vehicle_status === "pending" && <input aria-label="Vehicle rejection reason" value={reasons[vehicle.id] ?? ""} onChange={(event) => setReasons((current) => ({...current,[vehicle.id]:event.target.value}))} placeholder="Reason if rejecting" className="mt-2 min-h-9 w-full rounded-lg border border-slate-300 px-3 text-xs" />}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 border-t border-slate-100 pt-4">
                      <p className="text-xs text-slate-600">{ready ? "All required documents and at least one vehicle are approved." : "Driver approval requires four approved documents and at least one approved vehicle."}</p>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <button type="button" disabled={!ready || busy === `driver-${driver.user_id}` || driver.verification_status === "verified"} onClick={() => void runAction(`driver-${driver.user_id}`, () => supabase.rpc("admin_review_driver",{p_driver_id:driver.user_id,p_next_status:"verified",p_reason:null}))} className="min-h-10 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Verify driver</button>
                        <button type="button" disabled={busy === `driver-${driver.user_id}` || (reasons[driver.user_id] ?? "").trim().length < 3} onClick={() => void runAction(`driver-${driver.user_id}`, () => supabase.rpc("admin_review_driver",{p_driver_id:driver.user_id,p_next_status:"rejected",p_reason:reasons[driver.user_id]}))} className="min-h-10 rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-800 disabled:opacity-50">Reject driver</button>
                        <input aria-label="Driver rejection reason" value={reasons[driver.user_id] ?? ""} onChange={(event) => setReasons((current) => ({...current,[driver.user_id]:event.target.value}))} placeholder="Reason if rejecting" className="min-h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {canSupport && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div><p className="text-sm font-semibold text-teal-800">Reports</p><h2 className="mt-1 text-xl font-bold text-slate-950">Safety and support queue</h2></div>
          {reports.length === 0 ? <p className="mt-4 text-sm text-slate-600">There are no reports to review.</p> : (
            <div className="mt-4 space-y-3">
              {reports.map((report) => (
                <article key={report.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div><h3 className="font-semibold capitalize text-slate-900">{report.category.replaceAll("_"," ")}</h3><p className="mt-1 text-xs text-slate-500">Reported {new Date(report.created_at).toLocaleString("en-KE")} · {names[report.reporter_id] ?? "User"} reported {names[report.reported_user_id] ?? "another user"}</p></div>
                    <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">{report.report_status}</span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{report.description}</p>
                  {report.report_status !== "resolved" && report.report_status !== "dismissed" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" disabled={busy === `report-${report.id}`} onClick={() => void runAction(`report-${report.id}`, () => supabase.rpc("admin_update_report_status",{p_report_id:report.id,p_next_status:"reviewing",p_note:null}))} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">Mark reviewing</button>
                      <button type="button" disabled={busy === `report-${report.id}`} onClick={() => void runAction(`report-${report.id}`, () => supabase.rpc("admin_update_report_status",{p_report_id:report.id,p_next_status:"resolved",p_note:null}))} className="rounded-lg bg-teal-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Resolve</button>
                      <button type="button" disabled={busy === `report-${report.id}`} onClick={() => void runAction(`report-${report.id}`, () => supabase.rpc("admin_update_report_status",{p_report_id:report.id,p_next_status:"dismissed",p_note:null}))} className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-800 disabled:opacity-50">Dismiss</button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
