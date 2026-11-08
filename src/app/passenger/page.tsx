import { RideDiscovery, type SharedRide, type Vehicle } from "@/components/passenger/ride-discovery";
import { createClient } from "@/lib/supabase/server";

export default async function PassengerHome() {
  const supabase = await createClient();
  const { data: rideRows } = await supabase
    .from("ride_offers")
    .select("id, vehicle_id, departure_time, available_seats, suggested_fare")
    .eq("offer_status", "open")
    .gte("departure_time", new Date().toISOString())
    .gt("available_seats", 0)
    .order("departure_time", { ascending: true })
    .limit(12);

  const initialSharedRides = (rideRows ?? []) as SharedRide[];
  const vehicleIds = [...new Set(initialSharedRides.map((ride) => ride.vehicle_id))];
  let initialVehicles: Record<string, Vehicle> = {};

  if (vehicleIds.length > 0) {
    const { data: vehicleRows } = await supabase
      .from("vehicles")
      .select("id, make, model, color, seat_capacity")
      .in("id", vehicleIds);

    initialVehicles = Object.fromEntries(
      ((vehicleRows ?? []) as Vehicle[]).map((vehicle) => [vehicle.id, vehicle])
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-medium text-teal-800">Passenger workspace</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">Find your next ride</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Discover verified drivers nearby and browse upcoming shared rides in Embu County.
        </p>
      </section>
      <RideDiscovery initialSharedRides={initialSharedRides} initialVehicles={initialVehicles} />
    </div>
  );
}
