export type AppRole = "passenger" | "driver" | "admin";
export type AccountStatus = "active" | "suspended" | "closed";
export type AdminRole = "super_admin" | "operations_admin" | "verification_admin" | "support_admin";
export type DriverVerificationStatus =
  | "pending"
  | "under_review"
  | "verified"
  | "rejected"
  | "suspended";

export type UserContext = {
  id: string;
  email: string | null;
  fullName: string;
  accountStatus: AccountStatus;
  role: AppRole;
  adminRole: AdminRole | null;
  driverVerificationStatus: DriverVerificationStatus | null;
};
