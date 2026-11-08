"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Notification = { id: string; title: string; message: string; is_read: boolean; created_at: string };

export function NotificationCenter({ userId, initialNotifications }: { userId: string; initialNotifications: Notification[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [busyId, setBusyId] = useState<string | null>(null);
  const unreadCount = notifications.filter((item) => !item.is_read).length;

  useEffect(() => {
    const channel = supabase.channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => router.refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router, supabase, userId]);

  async function markRead(id: string) {
    setBusyId(id);
    const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id).eq("user_id", userId);
    setBusyId(null);
    if (!error) setNotifications((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item));
  }

  return (
    <details className="relative">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        Notifications
        <span className="rounded-full bg-teal-800 px-2 py-0.5 text-xs text-white">{unreadCount}</span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
        <div className="flex items-center justify-between gap-2 px-1 pb-2">
          <p className="text-sm font-bold text-slate-900">Recent notifications</p>
          <span className="text-xs text-slate-500">{unreadCount} unread</span>
        </div>
        {notifications.length === 0 ? <p className="px-1 py-4 text-sm text-slate-500">You have no notifications.</p> : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {notifications.map((item) => (
              <article key={item.id} className={`rounded-lg p-3 ${item.is_read ? "bg-slate-50" : "bg-teal-50"}`}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                  {!item.is_read && <span className="mt-1 size-2 shrink-0 rounded-full bg-teal-700" />}
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-700">{item.message}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <time className="text-[11px] text-slate-500">{new Date(item.created_at).toLocaleString("en-KE")}</time>
                  {!item.is_read && <button type="button" disabled={busyId === item.id} onClick={() => void markRead(item.id)} className="text-xs font-semibold text-teal-800 underline underline-offset-4 disabled:opacity-50">{busyId === item.id ? "Saving…" : "Mark read"}</button>}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
