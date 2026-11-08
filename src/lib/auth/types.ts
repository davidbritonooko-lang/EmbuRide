export type AppRole = "passenger" | "driver" | "admin";
export type AccountStatus = "active" | "suspended" | "closed";
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
  adminRole: string | null;
  driverVerificationStatus: DriverVerificationStatus | null;
};
