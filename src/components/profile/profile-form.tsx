"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ProfileForm({ userId, initialName, initialPhone }: { userId: string; initialName: string; initialPhone: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [fullName, setFullName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    const { error: updateError } = await supabase.rpc("update_own_profile", {
      p_full_name: fullName.trim(),
      p_phone: phone.trim() || null,
    });
    setBusy(false);
    if (updateError) {
      setError("Your profile could not be updated. Check your name and phone number.");
      return;
    }
    setNotice("Your profile details have been updated.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Full name
          <input value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={2} maxLength={120} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" />
        </label>
        <label className="text-sm font-medium text-slate-700">Phone number
          <input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" minLength={7} maxLength={24} placeholder="+254 7XX XXX XXX" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" />
        </label>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">Your phone number is private and is shared with the other booking participant only after a booking is confirmed.</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</p>}
      <button type="submit" disabled={busy || fullName.trim().length < 2} className="mt-5 min-h-11 rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50">{busy ? "Saving…" : "Save profile"}</button>
    </form>
  );
}
