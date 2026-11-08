import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/server";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export const dynamic = "force-dynamic";

export default async function DriverLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("driver");
  return <WorkspaceShell title="Driver" fullName={user.fullName}>{children}</WorkspaceShell>;
}
