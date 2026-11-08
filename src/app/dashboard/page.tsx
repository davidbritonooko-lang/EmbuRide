import { redirect } from "next/navigation";
import { requireUserContext } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function DashboardRouter() {
  const context = await requireUserContext();
  if (context.role === "admin") redirect("/admin");
  if (context.role === "driver") redirect("/driver");
  redirect("/passenger");
}
