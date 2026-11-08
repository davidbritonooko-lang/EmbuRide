import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AccountStatus, AppRole, DriverVerificationStatus, UserContext } from "./types";

export async function getUserContext(): Promise<UserContext | null> {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const [profileResult, adminResult, driverResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, account_status")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("admin_profiles")
      .select("user_id, admin_role")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("driver_profiles")
      .select("user_id, verification_status")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (profileResult.error) throw new Error("Unable to load account profile.");
  if (adminResult.error) throw new Error("Unable to resolve account permissions.");
  if (driverResult.error) throw new Error("Unable to resolve driver status.");

  const profile = profileResult.data;
  if (!profile) return null;

  const admin = adminResult.data;
  const driver = driverResult.data;
  const role: AppRole = admin ? "admin" : driver ? "driver" : "passenger";

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile.full_name,
    accountStatus: profile.account_status as AccountStatus,
    role,
    adminRole: admin?.admin_role ?? null,
    driverVerificationStatus: (driver?.verification_status as DriverVerificationStatus | undefined) ?? null,
  };
}

export async function requireUserContext(): Promise<UserContext> {
  const context = await getUserContext();
  if (!context) redirect("/login?error=profile");
  if (context.accountStatus !== "active") redirect("/account/unavailable");
  return context;
}

export async function requireRole(expectedRole: AppRole): Promise<UserContext> {
  const context = await requireUserContext();
  if (context.role !== expectedRole) redirect("/dashboard");
  return context;
}
