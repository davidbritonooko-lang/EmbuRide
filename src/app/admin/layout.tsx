import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/server";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("admin");
  return <WorkspaceShell title="Administration" fullName={user.fullName}>{children}</WorkspaceShell>;
}
