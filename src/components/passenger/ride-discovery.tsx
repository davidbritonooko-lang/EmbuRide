"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type NearbyDriver = {
  driver_id: string;
  display_name: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_color: string | null;
  seat_capacity: number;
  distance_meters: number;
  average_rating: number;
};

type SharedRide = {
  id: string;
  vehicle_id: string;
  departure_time: string;
  available_seats: number;
  suggested_fare: number | null;
};

type Vehicle = {
  id: string;
  make: string;
  model: string;
  color: string | null;
  seat_capacity: number;
};

function formatDistance(meters: number) {
  return meters < 1000
    ? `${Math.round(meters)} m away`
    : `${(meters / 1000).toFixed(1)} km away`;
}

function formatDeparture(value: string) {
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function RideDiscovery() {
  const supabase = useMemo(() => createClient(), []);
  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);
  const [sharedRides, setSharedRides] = useState<SharedRide[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, Vehicle>>({});
  const [locationState, setLocationState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [loadingRides, setLoadingRides] = useState(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [ridesError, setRidesError] = useState<string | null>(null);

  const loadSharedRides = useCallback(async () => {
    setLoadingRides(true);
    setRidesError(null);

    const { data, error } = await supabase
      .from("ride_offers")
      .select("id, vehicle_id, departure_time, available_seats, suggested_fare")
      .eq("offer_status", "open")
      .gte("departure_time", new Date().toISOString())
      .gt("available_seats", 0)
      .order("departure_time", { ascending: true })
      .limit(12);

    if (error) {
      setRidesError("Shared rides could not be loaded. Please try again.");
      setSharedRides([]);
      setVehicles({});
      setLoadingRides(false);
      return;
    }

    const offers = (data ?? []) as SharedRide[];
    setSharedRides(offers);

    const vehicleIds = [...new Set(offers.map((offer) => offer.vehicle_id))];
    if (vehicleIds.length > 0) {
      const { data: vehicleRows } = await supabase
        .from("vehicles")
        .select("id, make, model, color, seat_capacity")
        .in("id", vehicleIds);

      const vehicleMap: Record<string, Vehicle> = {};
      for (const vehicle of (vehicleRows ?? []) as Vehicle[]) {
        vehicleMap[vehicle.id] = vehicle;
      }
      setVehicles(vehicleMap);
    } else {
      setVehicles({});
    }

    setLoadingRides(false);
  }, [supabase]);

  useEffect(() => {
    void loadSharedRides();
  }, [loadSharedRides]);

  const searchNearbyDrivers = () => {
    setSearchError(null);
    setLocationState("loading");
    setDrivers([]);

    if (!navigator.geolocation) {
      setLocationState("unavailable");
      setSearchError("This browser does not support location access.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { data, error } = await supabase.rpc("search_nearby_drivers", {
          p_latitude: coords.latitude,
          p_longitude: coords.longitude,
          p_radius_meters: 10000,
          p_limit: 20,
        });

        if (error) {
          setSearchError("Nearby drivers could not be found. Please try again.");
          setLocationState("unavailable");
          return;
        }

        setDrivers((data ?? []) as NearbyDriver[]);
        setLocationState("ready");
      },
      (error) => {
        setLocationState("unavailable");
        setSearchError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was not granted. You can enable it in your browser settings and try again."
            : "Your current location could not be determined. Please try again."
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-800">Nearby drivers</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Find an available driver</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
              Search for verified, available drivers within 10 km of your current location.
              Your location is used for this search and is not broadcast to drivers.
            </p>
          </div>
          <button
            type="button"
            onClick={searchNearbyDrivers}
            disabled={locationState === "loading"}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {locationState === "loading" ? "Finding drivers…" : "Use my location"}
          </button>
        </div>

        {searchError && (
          <p role="alert" className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {searchError}
          </p>
        )}

        {locationState === "ready" && (
          <div className="mt-5 space-y-3">
            <p className="text-sm font-medium text-slate-700">
              {drivers.length === 0
                ? "No verified drivers are currently available within 10 km."
                : `${drivers.length} nearby driver${drivers.length === 1 ? "" : "s"} found`}
            </p>
            {drivers.map((driver) => (
              <article key={driver.driver_id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{driver.display_name}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {driver.vehicle_color ? `${driver.vehicle_color} ` : ""}
                    {driver.vehicle_make} {driver.vehicle_model}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatDistance(driver.distance_meters)} · {driver.seat_capacity} seats · ★ {Number(driver.average_rating).toFixed(1)}
                  </p>
                </div>
                <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                  Verified driver
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-800">Shared rides</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Upcoming shared trips</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Browse published shared rides with available seats across Embu County.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSharedRides()}
            disabled={loadingRides}
            className="min-h-10 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Refresh rides
          </button>
        </div>

        {ridesError && <p role="alert" className="mt-4 text-sm text-rose-700">{ridesError}</p>}
        {loadingRides ? (
          <p className="mt-5 text-sm text-slate-500">Loading available rides…</p>
        ) : sharedRides.length === 0 ? (
          <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            There are no upcoming shared rides available right now. Check again later.
          </p>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {sharedRides.map((ride) => {
              const vehicle = vehicles[ride.vehicle_id];
              return (
                <article key={ride.id} className="rounded-xl border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">
                    {vehicle ? `${vehicle.make} ${vehicle.model}` : "Verified shared-ride vehicle"}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">{formatDeparture(ride.departure_time)}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-teal-50 px-3 py-1 font-semibold text-teal-900">
                      {ride.available_seats} {ride.available_seats === 1 ? "seat" : "seats"} available
                    </span>
                    {ride.suggested_fare !== null && (
                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        Suggested fare: KES {Number(ride.suggested_fare).toLocaleString("en-KE")}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
