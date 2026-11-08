import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/server";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DriverLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("driver");
  const supabase = await createClient();
  const { data: notifications } = await supabase.from("notifications")
    .select("id, title, message, is_read, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);
  return <WorkspaceShell title="Driver" fullName={user.fullName} userId={user.id} notifications={notifications ?? []}>{children}</WorkspaceShell>;
}
