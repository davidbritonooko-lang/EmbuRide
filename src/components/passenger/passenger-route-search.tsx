"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RouteLocationMap, type MapPoint } from "@/components/maps/route-location-map";

type Place = { lat: number; lon: number; label: string };
type PrivateDriver = {
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
  ride_offer_id: string;
  driver_id: string;
  driver_name: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_color: string | null;
  seat_capacity: number;
  departure_time: string;
  available_seats: number;
  suggested_fare: number | null;
  average_rating: number;
};

async function geocodeEmbuPlace(place: string): Promise<Place> {
  const query = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    countrycodes: "ke",
    q: `${place}, Embu County, Kenya`,
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${query.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Location search is temporarily unavailable.");
  const results = (await response.json()) as Array<{ lat: string; lon: string; display_name: string }>;
  if (!results.length) throw new Error(`We could not find "${place}" in Embu County. Try a nearby town or landmark.`);
  return { lat: Number(results[0].lat), lon: Number(results[0].lon), label: results[0].display_name };
}


async function reverseGeocodeEmbuPoint(lat: number, lon: number): Promise<MapPoint> {
  const query = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lon) });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("The selected map location could not be identified. You can still use its coordinates.");
  const result = (await response.json()) as { display_name?: string };
  return { lat, lon, label: result.display_name ?? `Selected map point (${lat.toFixed(5)}, ${lon.toFixed(5)})` };
}

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m away` : `${(meters / 1000).toFixed(1)} km away`;
}

export function PassengerRouteSearch() {
  const supabase = useMemo(() => createClient(), []);
  const [pickup, setPickup] = useState("Embu Town");
  const [destination, setDestination] = useState("");
  const [passengerCount, setPassengerCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [privateDrivers, setPrivateDrivers] = useState<PrivateDriver[]>([]);
  const [sharedRides, setSharedRides] = useState<SharedRide[]>([]);
  const [places, setPlaces] = useState<{ pickup: Place; destination: Place } | null>(null);
  const [mapPickup, setMapPickup] = useState<MapPoint | null>(null);
  const [mapDestination, setMapDestination] = useState<MapPoint | null>(null);
  const [activeMapField, setActiveMapField] = useState<"pickup" | "destination">("pickup");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bookingBusy, setBookingBusy] = useState<string | null>(null);

  async function searchRoute(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    setPrivateDrivers([]);
    setSharedRides([]);

    try {
      if (pickup.trim().length < 2 || destination.trim().length < 2) {
        throw new Error("Enter both a pickup location and a destination.");
      }

      const pickupPlace = mapPickup ?? await geocodeEmbuPlace(pickup.trim());
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const destinationPlace = mapDestination ?? await geocodeEmbuPlace(destination.trim());
      setPlaces({ pickup: pickupPlace, destination: destinationPlace });

      const [driverResult, sharedResult] = await Promise.all([
        supabase.rpc("search_nearby_drivers", {
          p_latitude: pickupPlace.lat,
          p_longitude: pickupPlace.lon,
          p_radius_meters: 10000,
          p_limit: 20,
        }),
        supabase.rpc("search_shared_rides", {
          p_origin_latitude: pickupPlace.lat,
          p_origin_longitude: pickupPlace.lon,
          p_destination_latitude: destinationPlace.lat,
          p_destination_longitude: destinationPlace.lon,
          p_radius_meters: 5000,
          p_departure_after: new Date().toISOString(),
          p_limit: 20,
        }),
      ]);

      if (driverResult.error || sharedResult.error) {
        throw new Error("Ride search could not be completed. Please try again.");
      }
      setPrivateDrivers((driverResult.data ?? []) as PrivateDriver[]);
      setSharedRides((sharedResult.data ?? []) as SharedRide[]);
    } catch (caught) {
      setPlaces(null);
      setError(caught instanceof Error ? caught.message : "Ride search could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  async function requestRide(driverId: string, rideType: "private" | "shared", offerId: string | null, key: string) {
    if (!places) return;
    setBookingBusy(key);
    setError(null);
    setNotice(null);

    const { data, error: bookingError } = await supabase.rpc("create_booking", {
      p_driver_id: driverId,
      p_ride_type: rideType,
      p_pickup_latitude: places.pickup.lat,
      p_pickup_longitude: places.pickup.lon,
      p_destination_latitude: places.destination.lat,
      p_destination_longitude: places.destination.lon,
      p_passenger_count: passengerCount,
      p_ride_offer_id: offerId,
    });

    setBookingBusy(null);
    if (bookingError || !data) {
      setError("Your ride request could not be sent. The driver or available seats may have changed; refresh the search and try again.");
      return;
    }
    setNotice(`Ride request sent. Your request reference is ${String(data).slice(0, 8).toUpperCase()}. The driver must respond before the booking is confirmed.`);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div>
        <p className="text-sm font-semibold text-teal-800">Plan a journey</p>
        <h2 className="mt-1 text-xl font-bold text-slate-950">Search by pickup and destination</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Find private drivers near your pickup point and shared rides travelling in the same direction.
        </p>
      </div>

      <form onSubmit={searchRoute} className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Pickup location
          <input value={pickup} onChange={(event) => { setPickup(event.target.value); setMapPickup(null); }} required minLength={2}
            placeholder="e.g. Embu Town"
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Destination
          <input value={destination} onChange={(event) => { setDestination(event.target.value); setMapDestination(null); }} required minLength={2}
            placeholder="e.g. Runyenjes"
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100" />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Passengers
          <select value={passengerCount} onChange={(event) => setPassengerCount(Number(event.target.value))}
            className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base">
            {[1,2,3,4,5,6,7,8].map((count) => <option key={count} value={count}>{count}</option>)}
          </select>
        </label>
        <div className="flex items-end">
          <button type="submit" disabled={loading}
            className="min-h-11 w-full rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? "Searching Embu County…" : "Search rides"}
          </button>
        </div>
      </form>


      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-semibold text-slate-800">Choose on map:</span>
          <button type="button" onClick={() => setActiveMapField("pickup")}
            aria-pressed={activeMapField === "pickup"}
            className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold ${activeMapField === "pickup" ? "bg-teal-800 text-white" : "border border-slate-300 text-slate-700"}`}>
            Set pickup
          </button>
          <button type="button" onClick={() => setActiveMapField("destination")}
            aria-pressed={activeMapField === "destination"}
            className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold ${activeMapField === "destination" ? "bg-teal-800 text-white" : "border border-slate-300 text-slate-700"}`}>
            Set destination
          </button>
          <button type="button" onClick={() => {
            if (!navigator.geolocation) { setError("This browser does not support location access."); return; }
            navigator.geolocation.getCurrentPosition(async ({ coords }) => {
              const point = { lat: coords.latitude, lon: coords.longitude, label: "My current location" };
              setMapPickup(point);
              setActiveMapField("destination");
              try {
                const resolved = await reverseGeocodeEmbuPoint(point.lat, point.lon);
                setPickup(resolved.label);
              } catch {
                setPickup("My current location");
              }
            }, () => setError("Your current location could not be determined. Check your browser location permission and try again."), { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
          }} className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
            Use my location for pickup
          </button>
        </div>
        <RouteLocationMap
          pickup={mapPickup}
          destination={mapDestination}
          onMapPick={(point) => {
            if (activeMapField === "pickup") {
              setMapPickup({ ...point, label: "Selected map point" });
              void reverseGeocodeEmbuPoint(point.lat, point.lon).then((resolved) => {
                setMapPickup(resolved);
                setPickup(resolved.label);
              }).catch(() => setPickup("Selected map point"));
            } else {
              setMapDestination({ ...point, label: "Selected map point" });
              void reverseGeocodeEmbuPoint(point.lat, point.lon).then((resolved) => {
                setMapDestination(resolved);
                setDestination(resolved.label);
              }).catch(() => setDestination("Selected map point"));
            }
          }}
        />
      </div>

      <p className="mt-3 text-xs text-slate-500">Location search uses OpenStreetMap Nominatim. Map data © OpenStreetMap contributors.</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-900">{notice}</p>}

      {places && !loading && (
        <div className="mt-6 space-y-5">
          <div className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            <p><span className="font-semibold text-slate-800">Pickup:</span> {places.pickup.label}</p>
            <p className="mt-1"><span className="font-semibold text-slate-800">Destination:</span> {places.destination.label}</p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-950">Private drivers nearby</h3>
            {privateDrivers.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No available private drivers were found near this pickup point.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {privateDrivers.map((driver) => (
                  <article key={driver.driver_id} className="rounded-xl border border-slate-200 p-4">
                    <h4 className="font-semibold text-slate-900">{driver.display_name}</h4>
                    <p className="mt-1 text-sm text-slate-600">{driver.vehicle_color ? `${driver.vehicle_color} ` : ""}{driver.vehicle_make} {driver.vehicle_model}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatDistance(driver.distance_meters)} · {driver.seat_capacity} seats · ★ {Number(driver.average_rating).toFixed(1)}</p>
                    <button type="button" disabled={bookingBusy === `private-${driver.driver_id}`}
                      onClick={() => void requestRide(driver.driver_id,"private",null,`private-${driver.driver_id}`)}
                      className="mt-4 min-h-10 w-full rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60">
                      {bookingBusy === `private-${driver.driver_id}` ? "Sending request…" : "Request private ride"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-slate-950">Shared rides on this route</h3>
            {sharedRides.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No upcoming shared rides currently match both locations.</p>
            ) : (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {sharedRides.map((ride) => (
                  <article key={ride.ride_offer_id} className="rounded-xl border border-slate-200 p-4">
                    <h4 className="font-semibold text-slate-900">{ride.driver_name}</h4>
                    <p className="mt-1 text-sm text-slate-600">{ride.vehicle_color ? `${ride.vehicle_color} ` : ""}{ride.vehicle_make} {ride.vehicle_model}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Intl.DateTimeFormat("en-KE",{dateStyle:"medium",timeStyle:"short"}).format(new Date(ride.departure_time))}
                      {" · "}{ride.available_seats} seats · ★ {Number(ride.average_rating).toFixed(1)}
                    </p>
                    {ride.suggested_fare !== null && <p className="mt-2 text-sm font-semibold text-slate-900">Suggested fare: KES {Number(ride.suggested_fare).toLocaleString("en-KE")}</p>}
                    <button type="button" disabled={bookingBusy === `shared-${ride.ride_offer_id}` || ride.available_seats < passengerCount}
                      onClick={() => void requestRide(ride.driver_id,"shared",ride.ride_offer_id,`shared-${ride.ride_offer_id}`)}
                      className="mt-4 min-h-10 w-full rounded-lg bg-teal-800 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50">
                      {bookingBusy === `shared-${ride.ride_offer_id}` ? "Sending request…" : ride.available_seats < passengerCount ? "Not enough seats" : "Request shared ride"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
