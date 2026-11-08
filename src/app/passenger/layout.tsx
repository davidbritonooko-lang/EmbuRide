import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth/server";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export const dynamic = "force-dynamic";

export default async function PassengerLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("passenger");
  return <WorkspaceShell title="Passenger" fullName={user.fullName}>{children}</WorkspaceShell>;
}
