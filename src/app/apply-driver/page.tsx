import Link from "next/link";
import { redirect } from "next/navigation";
import { DriverApplicationForm } from "@/components/driver/driver-application-form";
import { requireUserContext } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function ApplyDriverPage() {
  const user = await requireUserContext();
  if (user.role === "admin") redirect("/dashboard");

  if (user.driverVerificationStatus === "verified" || user.driverVerificationStatus === "suspended") {
    redirect("/driver");
  }

  const supabase = await createClient();
  const { data: documentRows } = await supabase.from("driver_documents")
    .select("document_type, verification_status, created_at")
    .eq("driver_id", user.id)
    .order("created_at", { ascending: false });
  const latestDocuments = new Map<string, string>();
  for (const document of documentRows ?? []) {
    if (!latestDocuments.has(document.document_type)) latestDocuments.set(document.document_type, document.verification_status);
  }
  const initialDocuments = [...latestDocuments.keys()] as ("national_id" | "driving_licence" | "vehicle_registration" | "vehicle_insurance")[];
  const initialDocumentStatuses = Object.fromEntries(latestDocuments.entries());

  return (
    <main className="min-h-dvh bg-slate-50 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <Link href="/passenger" className="text-sm font-semibold text-teal-800 hover:underline">← Back to passenger workspace</Link>
        <header className="mb-7 mt-6">
          <p className="text-sm font-semibold tracking-wide text-teal-800">DRIVER REGISTRATION</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Apply to drive with EmbuRide</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Submit your contact and vehicle details, then upload the documents required for verification. You cannot accept rides until an authorized administrator approves your application and vehicle.
          </p>
        </header>
        <DriverApplicationForm userId={user.id} hasApplication={user.driverVerificationStatus !== null} initialDocuments={initialDocuments} initialDocumentStatuses={initialDocumentStatuses} />
      </div>
    </main>
  );
}
