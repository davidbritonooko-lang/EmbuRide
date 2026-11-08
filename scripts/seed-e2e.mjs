import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.E2E_PASSWORD;

if (!supabaseUrl || !publishableKey || !serviceRoleKey || !password) {
  throw new Error("Local Supabase URL, keys, and E2E_PASSWORD are required.");
}

const hostname = new URL(supabaseUrl).hostname;
if (!["127.0.0.1", "localhost"].includes(hostname)) {
  throw new Error("E2E seed script is restricted to a local Supabase instance.");
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const users = [
  { key: "passenger", email: "e2e-passenger@example.invalid", name: "E2E Passenger" },
  { key: "driver", email: "e2e-driver@example.invalid", name: "E2E Driver" },
  { key: "admin", email: "e2e-admin@example.invalid", name: "E2E Administrator" },
];

const created = {};
for (const item of users) {
  const { data, error } = await admin.auth.admin.createUser({
    email: item.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: item.name },
  });
  if (error || !data.user) {
    throw new Error(`Could not create local ${item.key} E2E user: ${error?.message ?? "missing user"}`);
  }
  created[item.key] = { ...item, id: data.user.id };

  const { error: profileError } = await admin
    .from("profiles")
    .update({ date_of_birth: "1990-01-01" })
    .eq("id", data.user.id);
  if (profileError) throw new Error(`Could not prepare ${item.key} profile: ${profileError.message}`);
}

const driver = created.driver;
const { error: driverProfileError } = await admin.from("driver_profiles").insert({
  user_id: driver.id,
  verification_status: "verified",
  verified_at: new Date().toISOString(),
  is_available: true,
});
if (driverProfileError) throw new Error(`Could not prepare E2E driver profile: ${driverProfileError.message}`);

const { error: vehicleError } = await admin.from("vehicles").insert({
  driver_id: driver.id,
  make: "Toyota",
  model: "Probox",
  registration_number: "E2E-DRV-001",
  color: "Silver",
  seat_capacity: 4,
  vehicle_status: "approved",
});
if (vehicleError) throw new Error(`Could not prepare E2E vehicle: ${vehicleError.message}`);

const { error: adminProfileError } = await admin.from("admin_profiles").insert({
  user_id: created.admin.id,
  admin_role: "super_admin",
});
if (adminProfileError) throw new Error(`Could not prepare E2E admin profile: ${adminProfileError.message}`);

const driverClient = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error: signInError } = await driverClient.auth.signInWithPassword({
  email: driver.email,
  password,
});
if (signInError) throw new Error(`Could not sign in local E2E driver: ${signInError.message}`);

const { error: availabilityError } = await driverClient.rpc("set_driver_availability", {
  p_is_available: true,
});
if (availabilityError) throw new Error(`Could not enable E2E driver availability: ${availabilityError.message}`);

const { error: presenceError } = await driverClient.rpc("set_driver_presence", {
  p_latitude: -0.539,
  p_longitude: 37.457,
  p_destination_latitude: null,
  p_destination_longitude: null,
  p_is_online: true,
});
if (presenceError) throw new Error(`Could not seed E2E driver presence: ${presenceError.message}`);

await driverClient.auth.signOut();
process.stdout.write("Created local passenger, verified driver, and super-admin E2E accounts.\n");
