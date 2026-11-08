"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const requiredDocuments = [
  { type: "national_id", label: "National ID" },
  { type: "driving_licence", label: "Driving licence" },
  { type: "vehicle_registration", label: "Vehicle registration" },
  { type: "vehicle_insurance", label: "Vehicle insurance" },
] as const;

type DocumentType = (typeof requiredDocuments)[number]["type"];

export function DriverApplicationForm({ userId, hasApplication = false, initialDocuments = [], initialDocumentStatuses = {} }: { userId: string; hasApplication?: boolean; initialDocuments?: DocumentType[]; initialDocumentStatuses?: Partial<Record<DocumentType,string>> }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [applicationSubmitted, setApplicationSubmitted] = useState(hasApplication);
  const [uploading, setUploading] = useState<DocumentType | null>(null);
  const [uploaded, setUploaded] = useState<DocumentType[]>(initialDocuments);
  const [documentStatuses, setDocumentStatuses] = useState<Partial<Record<DocumentType,string>>>(initialDocumentStatuses);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const latestAdultDateOfBirth = new Date();
  latestAdultDateOfBirth.setFullYear(latestAdultDateOfBirth.getFullYear() - 18);
  const maxDriverDateOfBirth = [
    latestAdultDateOfBirth.getFullYear(),
    String(latestAdultDateOfBirth.getMonth() + 1).padStart(2, "0"),
    String(latestAdultDateOfBirth.getDate()).padStart(2, "0"),
  ].join("-");

  async function submitApplication(formData: FormData) {
    setError(null);
    setSuccess(null);
    const { error: submitError } = await supabase.rpc("submit_driver_application", {
      p_phone: String(formData.get("phone") ?? "").trim(),
      p_date_of_birth: String(formData.get("dateOfBirth") ?? ""),
      p_vehicle_make: String(formData.get("make") ?? "").trim(),
      p_vehicle_model: String(formData.get("model") ?? "").trim(),
      p_registration_number: String(formData.get("registration") ?? "").trim(),
      p_vehicle_color: String(formData.get("color") ?? "").trim(),
      p_seat_capacity: Number(formData.get("seats")),
    });

    if (submitError) {
      setError("The application could not be submitted. Check the details and registration number, then try again.");
      return;
    }

    setApplicationSubmitted(true);
    setSuccess("Your driver application has been created. Upload the four required documents to continue verification.");
  }

  async function uploadDocument(type: DocumentType, file: File | undefined) {
    if (!file) return;
    setError(null);
    setSuccess(null);

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      setError("Upload a PDF, JPG or PNG document.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Each document must be 10 MB or smaller.");
      return;
    }

    setUploading(type);
    const extension = file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg";
    const path = `${userId}/${type}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("driver-documents")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setError("The document could not be uploaded. Please try again.");
      setUploading(null);
      return;
    }

    const { error: registerError } = await supabase.rpc("register_driver_document", {
      p_document_type: type,
      p_storage_path: path,
    });

    if (registerError) {
      setError("The file was uploaded but could not be attached to your application. Contact support before uploading it again.");
      setUploading(null);
      return;
    }

    setUploaded((current) => current.includes(type) ? current : [...current, type]);
    setDocumentStatuses((current) => ({ ...current, [type]: "pending" }));
    setSuccess("Document uploaded successfully.");
    setUploading(null);
  }

  return (
    <div className="space-y-6">
      {!applicationSubmitted ? (
        <form
          action={submitApplication}
          className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2 sm:p-7"
        >
          <div className="sm:col-span-2">
            <h2 className="text-lg font-bold text-slate-950">Contact and vehicle details</h2>
            <p className="mt-1 text-sm text-slate-600">Your vehicle will remain pending until it has been reviewed by EmbuRide.</p>
          </div>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Date of birth (drivers must be 18 or older)
            <input name="dateOfBirth" type="date" required max={maxDriverDateOfBirth}
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
            <span className="mt-1 block text-xs font-normal text-slate-500">
              Used only to verify driver eligibility. It is not shown to passengers.
            </span>
          </label>
          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Phone number
            <input name="phone" type="tel" required minLength={7} maxLength={24} placeholder="+254 7XX XXX XXX"
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Vehicle make
            <input name="make" required minLength={2} maxLength={80} placeholder="Toyota"
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Vehicle model
            <input name="model" required maxLength={80} placeholder="Probox"
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Registration number
            <input name="registration" required minLength={3} maxLength={24} placeholder="KXX 123X"
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base uppercase outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Vehicle colour
            <input name="color" maxLength={40} placeholder="Silver"
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Passenger seat capacity
            <select name="seats" required defaultValue="4"
              className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100">
              {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20].map((seat) => (
                <option key={seat} value={seat}>{seat} {seat === 1 ? "seat" : "seats"}</option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            {error && <p role="alert" className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
            <button type="submit" className="min-h-11 w-full rounded-xl bg-teal-800 px-5 py-3 font-semibold text-white hover:bg-teal-900 sm:w-auto">
              Submit driver application
            </button>
          </div>
        </form>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-lg font-bold text-slate-950">Upload verification documents</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Upload clear copies of all four documents. Files are stored in a private bucket and are visible only to you and authorized verification administrators.
          </p>
          <div className="mt-5 space-y-3">
            {requiredDocuments.map((document) => {
              const isUploaded = uploaded.includes(document.type);
              return (
                <div key={document.type} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{document.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{documentStatuses[document.type] ? `Latest submission: ${documentStatuses[document.type]}` : isUploaded ? "Uploaded" : "PDF, JPG or PNG · maximum 10 MB"}</p>
                  </div>
                  <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    {uploading === document.type ? "Uploading…" : isUploaded ? "Replace file" : "Choose file"}
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only"
                      disabled={uploading !== null}
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        void uploadDocument(document.type, file);
                        event.currentTarget.value = "";
                      }} />
                  </label>
                </div>
              );
            })}
          </div>
          {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
          {success && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{success}</p>}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">{uploaded.length} of 4 required documents uploaded</p>
            <button type="button" disabled={uploaded.length !== 4}
              onClick={() => router.push("/dashboard")}
              className="min-h-11 rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50">
              Continue to driver dashboard
            </button>
          </div>
        </section>
      )}
      {success && !applicationSubmitted && <p role="status" className="text-sm text-emerald-800">{success}</p>}
      {error && !applicationSubmitted && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
