"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Vehicle = {
  id: string;
  make: string;
  model: string;
  registration_number: string;
  color: string | null;
  seat_capacity: number;
  vehicle_status: string;
};

type Booking = {
  id: string;
  passenger_id: string;
  ride_type: string;
  passenger_count: number;
  agreed_fare: number | null;
  booking_status: string;
  created_at: string;
};

type FareOffer = {
  id: string;
  booking_id: string;
  proposed_by: string;
  amount: number;
  message: string | null;
  offer_status: string;
  created_at: string;
};

const activeStatuses = ["confirmed", "driver_arriving", "picked_up", "in_progress"];

function nextStatus(status: string) {
  if (status === "confirmed") return "driver_arriving";
  if (status === "driver_arriving") return "picked_up";
  if (status === "picked_up") return "in_progress";
  if (status === "in_progress") return "completed";
  return null;
}

export function DriverWorkspace({
  driverId,
  verificationStatus,
  initialAvailability,
  vehicles,
  bookings,
  passengerNames,
  fareOffers,
}: {
  driverId: string;
  verificationStatus: string;
  initialAvailability: boolean;
  vehicles: Vehicle[];
  bookings: Booking[];
  passengerNames: Record<string, string>;
  fareOffers: FareOffer[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [available, setAvailable] = useState(initialAvailability);
  const [busy, setBusy] = useState<string | null>(null);
  const [fareAmounts, setFareAmounts] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [contacts, setContacts] = useState<Record<string, { name: string; phone: string | null }>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharingBookingId, setSharingBookingId] = useState<string | null>(null);
  const [presenceSharing, setPresenceSharing] = useState(false);
  const locationWatchIdRef = useRef<number | null>(null);
  const sharingBookingIdRef = useRef<string | null>(null);
  const lastLocationSentAtRef = useRef(0);
  const presenceWatchIdRef = useRef<number | null>(null);
  const presenceSharingRef = useRef(false);
  const lastPresenceSentAtRef = useRef(0);
  const lastKnownCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);

  const stopPresenceSharing = useCallback((markOffline = false) => {
    const wasSharing = presenceSharingRef.current;
    presenceSharingRef.current = false;
    if (presenceWatchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(presenceWatchIdRef.current);
    }
    presenceWatchIdRef.current = null;
    setPresenceSharing(false);

    const coordinates = lastKnownCoordsRef.current;
    if (markOffline && wasSharing && coordinates) {
      void Promise.resolve(supabase.rpc("set_driver_presence", {
        p_latitude: coordinates.latitude,
        p_longitude: coordinates.longitude,
        p_destination_latitude: null,
        p_destination_longitude: null,
        p_is_online: false,
      })).then(({ error: presenceError }) => {
        if (presenceError) setError("The driver presence status could not be cleared.");
      }).catch(() => setError("The driver presence status could not be cleared."));
    }
  }, [supabase]);

  const startPresenceSharing = useCallback(() => {
    if (presenceWatchIdRef.current !== null) return true;
    if (!navigator.geolocation) {
      setError("This browser does not support location sharing. Location access is required for nearby-driver discovery.");
      return false;
    }

    presenceSharingRef.current = true;
    setPresenceSharing(true);
    lastPresenceSentAtRef.current = 0;

    try {
      const watchId = navigator.geolocation.watchPosition(
        ({ coords }) => {
          if (!presenceSharingRef.current) return;
          const coordinates = { latitude: coords.latitude, longitude: coords.longitude };
          lastKnownCoordsRef.current = coordinates;
          const now = Date.now();
          if (now - lastPresenceSentAtRef.current < 30000) return;
          lastPresenceSentAtRef.current = now;

          void Promise.resolve(supabase.rpc("set_driver_presence", {
            p_latitude: coordinates.latitude,
            p_longitude: coordinates.longitude,
            p_destination_latitude: null,
            p_destination_longitude: null,
            p_is_online: true,
          })).then(({ error: presenceError }) => {
            if (!presenceSharingRef.current) return;
            if (presenceError) {
              stopPresenceSharing(false);
              void Promise.resolve(supabase.rpc("set_driver_availability", { p_is_available: false }));
              setAvailable(false);
              setError("Your location could not be shared, so driver availability was switched off.");
            }
          }).catch(() => {
            if (!presenceSharingRef.current) return;
            stopPresenceSharing(false);
            void Promise.resolve(supabase.rpc("set_driver_availability", { p_is_available: false }));
            setAvailable(false);
            setError("The connection failed while sharing your location. Driver availability was switched off.");
          });
        },
        () => {
          if (!presenceSharingRef.current) return;
          stopPresenceSharing(false);
          void Promise.resolve(supabase.rpc("set_driver_availability", { p_is_available: false })).then(({ error: availabilityError }) => {
            setAvailable(false);
            setError(availabilityError
              ? "Location access was lost. Update your availability and location permission before continuing."
              : "Location access was lost, so driver availability was switched off.");
          }).catch(() => {
            setAvailable(false);
            setError("Location access was lost and availability could not be updated. Please retry.");
          });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
      if (presenceSharingRef.current) presenceWatchIdRef.current = watchId;
      else navigator.geolocation.clearWatch(watchId);
      return true;
    } catch {
      stopPresenceSharing(false);
      setError("The browser could not start location sharing.");
      return false;
    }
  }, [stopPresenceSharing, supabase]);

  const stopLiveLocation = useCallback((showMessage = true) => {
    if (locationWatchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
    }
    locationWatchIdRef.current = null;
    sharingBookingIdRef.current = null;
    setSharingBookingId(null);
    setBusy((current) => current?.startsWith("location-") ? null : current);
    if (showMessage) setMessage("Live location sharing has stopped.");
  }, []);


  useEffect(() => {
    const channel = supabase.channel(`driver-bookings-${driverId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `driver_id=eq.${driverId}` }, (payload) => {
        const changedBooking = payload.new as { id?: string; booking_status?: string };
        if (
          changedBooking.id === sharingBookingIdRef.current &&
          !activeStatuses.includes(changedBooking.booking_status ?? "")
        ) {
          stopLiveLocation(false);
          setMessage("Live location sharing stopped because the booking is no longer active.");
        }
        router.refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "fare_offers" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_events" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_locations" }, () => router.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "ride_offers" }, () => router.refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [driverId, router, supabase, stopLiveLocation]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        stopLiveLocation(false);
        stopPresenceSharing(true);
        setMessage("Location sharing stopped because this page is no longer visible. Enable location sharing again when you return.");
      }
    };
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => document.removeEventListener("visibilitychange", stopWhenHidden);
  }, [stopLiveLocation, stopPresenceSharing]);

  useEffect(() => {
    return () => {
      if (locationWatchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current);
      }
      if (presenceWatchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(presenceWatchIdRef.current);
      }
      const coordinates = lastKnownCoordsRef.current;
      if (presenceSharingRef.current && coordinates) {
        void Promise.resolve(supabase.rpc("set_driver_presence", {
          p_latitude: coordinates.latitude,
          p_longitude: coordinates.longitude,
          p_destination_latitude: null,
          p_destination_longitude: null,
          p_is_online: false,
        })).catch(() => undefined);
      }
      locationWatchIdRef.current = null;
      presenceWatchIdRef.current = null;
      presenceSharingRef.current = false;
      sharingBookingIdRef.current = null;
    };
  }, [supabase]);

  async function runAction(key: string, action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(key);
    setError(null);
    setMessage(null);
    const result = await action();
    setBusy(null);
    if (result.error) {
      setError("That action could not be completed. Check the booking status and try again.");
      return false;
    }
    setMessage("The booking has been updated.");
    router.refresh();
    return true;
  }

  async function changeAvailability(value: boolean) {
    const ok = await runAction("availability", () => supabase.rpc("set_driver_availability", { p_is_available: value }));
    if (!ok) return;

    setAvailable(value);
    if (value) {
      if (!startPresenceSharing()) {
        const { error: rollbackError } = await supabase.rpc("set_driver_availability", { p_is_available: false });
        setAvailable(false);
        if (rollbackError) setError("Location sharing could not start and availability could not be reset. Please retry.");
      }
    } else {
      stopPresenceSharing(false);
      stopLiveLocation(false);
    }
  }

  async function proposeFare(bookingId: string) {
    const amount = Number(fareAmounts[bookingId]);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid fare amount in Kenyan shillings.");
      return;
    }
    await runAction(`fare-${bookingId}`, () =>
      supabase.rpc("propose_fare", { p_booking_id: bookingId, p_amount: amount, p_message: null })
    );
    setFareAmounts((current) => ({ ...current, [bookingId]: "" }));
  }

  async function revealContact(bookingId: string) {
    setBusy(`contact-${bookingId}`);
    setError(null);
    const { data, error: contactError } = await supabase.rpc("get_booking_contact", { p_booking_id: bookingId });
    setBusy(null);
    if (contactError || !data?.[0]) {
      setError("Passenger contact details are not available for this booking yet.");
      return;
    }
    setContacts((current) => ({
      ...current,
      [bookingId]: { name: data[0].full_name, phone: data[0].phone },
    }));
  }

  function startLiveLocation(bookingId: string) {
    if (!navigator.geolocation) {
      setError("This browser does not support location sharing.");
      return;
    }

    if (locationWatchIdRef.current !== null) stopLiveLocation(false);
    sharingBookingIdRef.current = bookingId;
    lastLocationSentAtRef.current = 0;
    setSharingBookingId(bookingId);
    setBusy(`location-${bookingId}`);
    setError(null);
    setMessage("Waiting for your current location. Sharing stays active only while this page is open.");

    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (sharingBookingIdRef.current !== bookingId) return;
        const now = Date.now();
        if (now - lastLocationSentAtRef.current < 15000) return;
        lastLocationSentAtRef.current = now;

        void Promise.resolve(supabase.rpc("record_trip_location", {
          p_booking_id: bookingId,
          p_latitude: coords.latitude,
          p_longitude: coords.longitude,
        })).then(({ error: locationError }) => {
          if (sharingBookingIdRef.current !== bookingId) return;
          setBusy((current) => current === `location-${bookingId}` ? null : current);
          if (locationError) {
            stopLiveLocation(false);
            setError("Live location sharing was stopped because the trip location could not be saved.");
          } else {
            setMessage("Live location is being shared with the passenger. Updates are sent at most once every 15 seconds while this page remains open.");
          }
        }).catch(() => {
          if (sharingBookingIdRef.current !== bookingId) return;
          stopLiveLocation(false);
          setError("Live location sharing was stopped because the connection failed.");
        });
      },
      () => {
        if (sharingBookingIdRef.current !== bookingId) return;
        stopLiveLocation(false);
        setError("Location permission was not granted or your current position could not be determined.");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );

    locationWatchIdRef.current = watchId;
  }

  const verified = verificationStatus === "verified";
  const approvedVehicles = vehicles.filter((vehicle) => vehicle.vehicle_status === "approved");

  return (
    <div className="space-y-7">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-800">Driver status</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">
              {verified ? "Your driver account is verified" : "Verification in progress"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {verified
                ? "You can manage availability and handle ride requests."
                : `Current status: ${verificationStatus}. You cannot accept or publish rides until verification is complete.`}
            </p>
          </div>
          {verified && (
            <button type="button" disabled={busy === "availability"}
              onClick={() => {
                if (!available) void changeAvailability(true);
                else if (!presenceSharing) {
                  if (!startPresenceSharing()) {
                    void changeAvailability(false).then(() => {
                      setError("Location sharing is required before nearby-driver discovery can be enabled.");
                    });
                  }
                } else void changeAvailability(false);
              }}
              className={`min-h-11 rounded-xl px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 ${available && presenceSharing ? "bg-emerald-700 hover:bg-emerald-800" : "bg-slate-800 hover:bg-slate-900"}`}>
              {busy === "availability" ? "Updating…" : available ? presenceSharing ? "Go offline" : "Enable location sharing" : "Go available"}
            </button>
          )}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Nearby search uses your current location to calculate approximate distance. Precise trip location is shared only with confirmed booking participants.
        </p>
        {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        {message && <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{message}</p>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-sm font-semibold text-teal-800">Your vehicles</p><h2 className="mt-1 text-xl font-bold text-slate-950">Vehicle verification</h2></div>
          <span className="text-sm text-slate-500">{approvedVehicles.length} approved</span>
        </div>
        {vehicles.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No vehicle has been registered yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {vehicles.map((vehicle) => (
              <article key={vehicle.id} className="rounded-xl border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900">{vehicle.make} {vehicle.model}</h3>
                <p className="mt-1 text-sm text-slate-600">{vehicle.registration_number} · {vehicle.seat_capacity} seats</p>
                <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${vehicle.vehicle_status === "approved" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                  {vehicle.vehicle_status.replaceAll("_", " ")}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div><p className="text-sm font-semibold text-teal-800">Ride requests</p><h2 className="mt-1 text-xl font-bold text-slate-950">Bookings and fare negotiation</h2></div>
        {!verified ? (
          <p className="mt-4 text-sm text-slate-600">Ride requests become available after driver verification.</p>
        ) : bookings.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">You do not have any ride requests or active bookings.</p>
        ) : (
          <div className="mt-5 space-y-4">
            {bookings.map((booking) => {
              const offers = fareOffers.filter((offer) => offer.booking_id === booking.id);
              const next = nextStatus(booking.booking_status);
              const contact = contacts[booking.id];
              return (
                <article key={booking.id} className="rounded-xl border border-slate-200 p-4 sm:p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="font-semibold text-slate-900">{passengerNames[booking.passenger_id] ?? "Passenger"} · {booking.ride_type} ride</h3>
                      <p className="mt-1 text-sm text-slate-600">{booking.passenger_count} passenger(s) · Requested {new Date(booking.created_at).toLocaleString("en-KE")}</p>
                    </div>
                    <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">{booking.booking_status.replaceAll("_", " ")}</span>
                  </div>
                  {booking.agreed_fare !== null && <p className="mt-3 text-sm font-semibold text-slate-900">Agreed fare: KES {Number(booking.agreed_fare).toLocaleString("en-KE")}</p>}

                  {offers.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Fare proposals</p>
                      {offers.map((offer) => (
                        <div key={offer.id} className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                          <div><p className="text-sm font-semibold text-slate-900">KES {Number(offer.amount).toLocaleString("en-KE")}</p>{offer.message && <p className="text-xs text-slate-600">{offer.message}</p>}</div>
                          {offer.offer_status === "proposed" && offer.proposed_by !== driverId && (
                            <button type="button" disabled={busy === `accept-${offer.id}`}
                              onClick={() => void runAction(`accept-${offer.id}`, () => supabase.rpc("accept_fare", { p_fare_offer_id: offer.id }))}
                              className="min-h-9 rounded-lg bg-teal-800 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-900 disabled:opacity-60">Accept fare</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {(booking.booking_status === "requested" || booking.booking_status === "negotiating") && (
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <label className="flex-1 text-xs font-medium text-slate-600">
                        Your fare proposal (KES)
                        <input type="number" min="0" step="1" value={fareAmounts[booking.id] ?? ""}
                          onChange={(event) => setFareAmounts((current) => ({ ...current, [booking.id]: event.target.value }))}
                          className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm" />
                      </label>
                      <button type="button" disabled={busy === `fare-${booking.id}`}
                        onClick={() => void proposeFare(booking.id)}
                        className="min-h-10 self-end rounded-lg border border-teal-800 px-4 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50 disabled:opacity-60">Send proposal</button>
                    </div>
                  )}

                  {booking.booking_status === "fare_agreed" && (
                    <button type="button" disabled={busy === `confirm-${booking.id}`}
                      onClick={() => void runAction(`confirm-${booking.id}`, () => supabase.rpc("confirm_booking", { p_booking_id: booking.id }))}
                      className="mt-4 min-h-10 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60">Confirm booking</button>
                  )}

                  {next && (
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <button type="button" disabled={busy === `status-${booking.id}`}
                        onClick={() => void runAction(`status-${booking.id}`, () => supabase.rpc("update_booking_status", { p_booking_id: booking.id, p_next_status: next }))}
                        className="min-h-10 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60">
                        {next === "completed" ? "Complete trip" : `Mark ${next.replaceAll("_", " ")}`}
                      </button>
                      <button type="button"
                        onClick={() => sharingBookingId === booking.id ? stopLiveLocation() : startLiveLocation(booking.id)}
                        className={`min-h-10 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-60 ${sharingBookingId === booking.id ? "border-rose-300 text-rose-800 hover:bg-rose-50" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>
                        {sharingBookingId === booking.id
                          ? busy === `location-${booking.id}` ? "Waiting for location…" : "Stop live sharing"
                          : "Start live location"}
                      </button>
                    </div>
                  )}

                  {activeStatuses.includes(booking.booking_status) && (
                    <div className="mt-4 border-t border-slate-100 pt-4">
                      {contact ? (
                        <p className="text-sm text-slate-700">Passenger: {contact.name} · {contact.phone ?? "No phone number on file"}</p>
                      ) : (
                        <button type="button" disabled={busy === `contact-${booking.id}`}
                          onClick={() => void revealContact(booking.id)}
                          className="text-sm font-semibold text-teal-800 underline underline-offset-4">
                          {busy === `contact-${booking.id}` ? "Loading contact…" : "Reveal passenger contact"}
                        </button>
                      )}
                    </div>
                  )}

                  {["fare_agreed", "confirmed", "driver_arriving", "picked_up", "in_progress"].includes(booking.booking_status) && (
                    <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                      <input aria-label="Reason for cancelling booking" value={reasons[booking.id] ?? ""}
                        onChange={(event) => setReasons((current) => ({ ...current, [booking.id]: event.target.value }))}
                        placeholder="Reason for cancelling this booking"
                        className="min-h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
                      <button type="button" disabled={busy === `cancel-${booking.id}` || (reasons[booking.id] ?? "").trim().length < 3}
                        onClick={() => void runAction(`cancel-${booking.id}`, () => supabase.rpc("cancel_booking", { p_booking_id: booking.id, p_reason: reasons[booking.id] }))}
                        className="min-h-10 rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50">Cancel booking</button>
                    </div>
                  )}

                  {(booking.booking_status === "requested" || booking.booking_status === "negotiating") && (
                    <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                      <input aria-label="Reason for declining booking" value={reasons[booking.id] ?? ""}
                        onChange={(event) => setReasons((current) => ({ ...current, [booking.id]: event.target.value }))}
                        placeholder="Reason for declining"
                        className="min-h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
                      <button type="button" disabled={busy === `reject-${booking.id}` || (reasons[booking.id] ?? "").trim().length < 3}
                        onClick={() => void runAction(`reject-${booking.id}`, () => supabase.rpc("reject_booking", { p_booking_id: booking.id, p_reason: reasons[booking.id] }))}
                        className="min-h-10 rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50">Decline request</button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
