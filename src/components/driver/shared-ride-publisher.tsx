"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RouteLocationMap, type MapPoint } from "@/components/maps/route-location-map";

type Vehicle = { id: string; make: string; model: string; seat_capacity: number };
type RideOffer = { id: string; departure_time: string; available_seats: number; suggested_fare: number | null; offer_status: string };

async function findPlace(value: string) {
  const params = new URLSearchParams({ format: "jsonv2", limit: "1", countrycodes: "ke", q: `${value}, Embu County, Kenya` });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Location search is temporarily unavailable.");
  const results = (await response.json()) as Array<{ lat: string; lon: string }>;
  if (!results.length) throw new Error(`We could not find "${value}" in Embu County.`);
  return { latitude: Number(results[0].lat), longitude: Number(results[0].lon) };
}


async function reverseFindPlace(lat: number, lon: number): Promise<MapPoint> {
  const params = new URLSearchParams({ format: "jsonv2", lat: String(lat), lon: String(lon) });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params.toString()}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("The selected map point could not be identified.");
  const result = (await response.json()) as { display_name?: string };
  return { lat, lon, label: result.display_name ?? "Selected map point" };
}

export function SharedRidePublisher({ vehicles, offers }: { vehicles: Vehicle[]; offers: RideOffer[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [origin, setOrigin] = useState("Embu Town");
  const [destination, setDestination] = useState("");
  const [originPoint, setOriginPoint] = useState<MapPoint | null>(null);
  const [destinationPoint, setDestinationPoint] = useState<MapPoint | null>(null);
  const [activeMapField, setActiveMapField] = useState<"origin" | "destination">("origin");
  const [departure, setDeparture] = useState("");
  const [seats, setSeats] = useState("1");
  const [fare, setFare] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);

  async function publish(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!selectedVehicle) { setError("Select an approved vehicle before publishing a ride."); return; }
    const departureDate = new Date(departure);
    if (!departure || Number.isNaN(departureDate.getTime()) || departureDate <= new Date()) {
      setError("Choose a departure time in the future."); return;
    }
    if (Number(seats) < 1 || Number(seats) > selectedVehicle.seat_capacity) {
      setError("Available seats cannot exceed the selected vehicle's capacity."); return;
    }
    setPublishing(true);
    try {
      const start = originPoint ? { latitude: originPoint.lat, longitude: originPoint.lon } : await findPlace(origin.trim());
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const end = destinationPoint ? { latitude: destinationPoint.lat, longitude: destinationPoint.lon } : await findPlace(destination.trim());
      const { error: publishError } = await supabase.rpc("create_shared_ride_offer", {
        p_vehicle_id: vehicleId,
        p_origin_latitude: start.latitude,
        p_origin_longitude: start.longitude,
        p_destination_latitude: end.latitude,
        p_destination_longitude: end.longitude,
        p_departure_time: departureDate.toISOString(),
        p_available_seats: Number(seats),
        p_suggested_fare: fare.trim() ? Number(fare) : null,
      });
      if (publishError) {
        setError("The shared ride could not be published. Check vehicle approval, departure time and seat count.");
      } else {
        setSuccess("Your shared ride has been published and is discoverable by passengers travelling along this route.");
        setDestination(""); setDeparture(""); setFare(""); setDestinationPoint(null); router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The shared ride could not be published.");
    } finally { setPublishing(false); }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div>
        <p className="text-sm font-semibold text-teal-800">Shared rides</p>
        <h2 className="mt-1 text-xl font-bold text-slate-950">Publish a shared trip</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Publish your route and available seats. Passengers searching for a similar journey can send a booking request.</p>
      </div>
      <form onSubmit={publish} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Approved vehicle
          <select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)} required className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base">
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.make} {vehicle.model} · {vehicle.seat_capacity} seats</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Starting point
          <input value={origin} onChange={(event) => { setOrigin(event.target.value); setOriginPoint(null); }} required minLength={2} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" />
        </label>
        <label className="text-sm font-medium text-slate-700">Destination
          <input value={destination} onChange={(event) => { setDestination(event.target.value); setDestinationPoint(null); }} required minLength={2} placeholder="e.g. Runyenjes" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" />
        </label>
        <label className="text-sm font-medium text-slate-700">Departure date and time
          <input type="datetime-local" value={departure} onChange={(event) => setDeparture(event.target.value)} required className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" />
        </label>
        <label className="text-sm font-medium text-slate-700">Seats offered
          <select value={seats} onChange={(event) => setSeats(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base">
            {Array.from({ length: selectedVehicle?.seat_capacity ?? 1 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count} {count === 1 ? "seat" : "seats"}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">Suggested fare per passenger (KES, optional)
          <input type="number" min="0" step="1" value={fare} onChange={(event) => setFare(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base" />
        </label>
        <div className="flex items-end"><button type="submit" disabled={publishing || vehicles.length === 0} className="min-h-11 w-full rounded-xl bg-teal-800 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-50">{publishing ? "Publishing ride…" : "Publish shared ride"}</button></div>
      </form>

      <div className="mt-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-semibold text-slate-800">Set route on map:</span>
          <button type="button" onClick={() => setActiveMapField("origin")} aria-pressed={activeMapField === "origin"}
            className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold ${activeMapField === "origin" ? "bg-teal-800 text-white" : "border border-slate-300 text-slate-700"}`}>Set starting point</button>
          <button type="button" onClick={() => setActiveMapField("destination")} aria-pressed={activeMapField === "destination"}
            className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold ${activeMapField === "destination" ? "bg-teal-800 text-white" : "border border-slate-300 text-slate-700"}`}>Set destination</button>
        </div>
        <RouteLocationMap pickup={originPoint} destination={destinationPoint} onMapPick={(point) => {
          if (activeMapField === "origin") {
            setOriginPoint({ ...point, label: "Selected map point" });
            void reverseFindPlace(point.lat, point.lon).then((resolved) => {
              setOriginPoint(resolved);
              setOrigin(resolved.label);
            }).catch(() => setOrigin("Selected map point"));
          } else {
            setDestinationPoint({ ...point, label: "Selected map point" });
            void reverseFindPlace(point.lat, point.lon).then((resolved) => {
              setDestinationPoint(resolved);
              setDestination(resolved.label);
            }).catch(() => setDestination("Selected map point"));
          }
        }} />
      </div>

      <p className="mt-3 text-xs text-slate-500">Location search uses OpenStreetMap Nominatim. Map data © OpenStreetMap contributors.</p>
      {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      {success && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{success}</p>}
      <div className="mt-7 border-t border-slate-100 pt-5">
        <h3 className="font-semibold text-slate-950">Your published rides</h3>
        {offers.length === 0 ? <p className="mt-2 text-sm text-slate-600">You have not published any shared rides yet.</p> : (
          <div className="mt-3 space-y-2">{offers.map((offer) => (
            <div key={offer.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-sm font-semibold text-slate-900">{new Intl.DateTimeFormat("en-KE",{dateStyle:"medium",timeStyle:"short"}).format(new Date(offer.departure_time))}</p><p className="mt-1 text-xs text-slate-600">{offer.available_seats} seats remaining{offer.suggested_fare !== null ? ` · Suggested KES ${Number(offer.suggested_fare).toLocaleString("en-KE")}` : ""}</p></div>
              <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">{offer.offer_status}</span>
            </div>
          ))}</div>
        )}
      </div>
    </section>
  );
}
