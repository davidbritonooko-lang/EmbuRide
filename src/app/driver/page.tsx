import { DriverWorkspace } from "@/components/driver/driver-workspace";
import { SharedRidePublisher } from "@/components/driver/shared-ride-publisher";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export default async function DriverHome() {
  const user = await requireRole("driver");
  const supabase = await createClient();

  const [profileResult, vehicleResult, bookingResult, rideOfferResult] = await Promise.all([
    supabase.from("driver_profiles")
      .select("verification_status, is_available")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("vehicles")
      .select("id, make, model, registration_number, color, seat_capacity, vehicle_status")
      .eq("driver_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("bookings")
      .select("id, passenger_id, ride_type, passenger_count, agreed_fare, booking_status, created_at")
      .eq("driver_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("ride_offers")
      .select("id, departure_time, available_seats, suggested_fare, offer_status")
      .eq("driver_id", user.id)
      .order("departure_time", { ascending: false })
      .limit(20),
  ]);

  const bookings = bookingResult.data ?? [];
  const passengerIds = [...new Set(bookings.map((booking) => booking.passenger_id))];
  const bookingIds = bookings.map((booking) => booking.id);

  const [passengerResult, fareResult] = await Promise.all([
    passengerIds.length > 0
      ? supabase.from("profiles").select("id, full_name").in("id", passengerIds)
      : Promise.resolve({ data: [] }),
    bookingIds.length > 0
      ? supabase.from("fare_offers")
          .select("id, booking_id, proposed_by, amount, message, offer_status, created_at")
          .in("booking_id", bookingIds)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);

  const passengerNames = Object.fromEntries(
    (passengerResult.data ?? []).map((profile) => [profile.id, profile.full_name])
  );

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-medium text-teal-800">Driver workspace</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">Your driving activity</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Manage your availability, vehicle verification, fare proposals and active trips.
        </p>
      </section>
      <DriverWorkspace
        driverId={user.id}
        verificationStatus={profileResult.data?.verification_status ?? user.driverVerificationStatus ?? "pending"}
        initialAvailability={profileResult.data?.is_available ?? false}
        vehicles={vehicleResult.data ?? []}
        bookings={bookings}
        passengerNames={passengerNames}
        fareOffers={fareResult.data ?? []}
      />
      {profileResult.data?.verification_status === "verified" && (
        <SharedRidePublisher
          vehicles={(vehicleResult.data ?? []).filter((vehicle) => vehicle.vehicle_status === "approved")}
          offers={rideOfferResult.data ?? []}
        />
      )}
    </div>
  );
}
