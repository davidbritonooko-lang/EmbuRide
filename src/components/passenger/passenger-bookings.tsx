"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Booking = { id: string; driver_id: string; ride_type: string; passenger_count: number; agreed_fare: number | null; booking_status: string; created_at: string };
type FareOffer = { id: string; booking_id: string; proposed_by: string; amount: number; message: string | null; offer_status: string; created_at: string };
type TripEvent = { id: number; booking_id: string; event_type: string; description: string | null; created_at: string };
type Payment = { id: string; booking_id: string; amount: number; payment_method: string; payment_status: string; reference: string | null; created_at: string };

const contactStatuses = ["confirmed","driver_arriving","picked_up","in_progress"];

export function PassengerBookings({
  userId, bookings, driverNames, fareOffers, events, payments,
}: {
  userId: string;
  bookings: Booking[];
  driverNames: Record<string,string>;
  fareOffers: FareOffer[];
  events: TripEvent[];
  payments: Payment[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [fareAmounts, setFareAmounts] = useState<Record<string,string>>({});
  const [reasons, setReasons] = useState<Record<string,string>>({});
  const [contacts, setContacts] = useState<Record<string,{name:string;phone:string|null}>>({});
  const [paymentMethods, setPaymentMethods] = useState<Record<string,string>>({});
  const [paymentReferences, setPaymentReferences] = useState<Record<string,string>>({});
  const [error, setError] = useState<string|null>(null);
  const [notice, setNotice] = useState<string|null>(null);

  useEffect(() => {
    const channel = supabase.channel(`passenger-bookings-${userId}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"bookings",filter:`passenger_id=eq.${userId}`},() => router.refresh())
      .on("postgres_changes",{event:"*",schema:"public",table:"fare_offers"},() => router.refresh())
      .on("postgres_changes",{event:"*",schema:"public",table:"trip_events"},() => router.refresh())
      .on("postgres_changes",{event:"*",schema:"public",table:"trip_locations"},() => router.refresh())
      .on("postgres_changes",{event:"*",schema:"public",table:"payment_records"},() => router.refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [router,supabase,userId]);

  async function runAction(key: string, action: () => PromiseLike<{error:{message:string}|null}>) {
    setBusy(key); setError(null); setNotice(null);
    const result = await action();
    setBusy(null);
    if (result.error) { setError("The action could not be completed. The booking may have changed; refresh and try again."); return false; }
    setNotice("Your booking has been updated.");
    router.refresh();
    return true;
  }

  async function proposeFare(bookingId: string) {
    const amount = Number(fareAmounts[bookingId]);
    if (!Number.isFinite(amount) || amount < 0) { setError("Enter a valid fare in Kenyan shillings."); return; }
    const ok = await runAction(`fare-${bookingId}`,() => supabase.rpc("propose_fare",{p_booking_id:bookingId,p_amount:amount,p_message:null}));
    if (ok) setFareAmounts((current) => ({...current,[bookingId]:""}));
  }

  async function revealContact(bookingId: string) {
    setBusy(`contact-${bookingId}`); setError(null);
    const {data,error:contactError} = await supabase.rpc("get_booking_contact",{p_booking_id:bookingId});
    setBusy(null);
    if (contactError || !data?.[0]) { setError("Driver contact details are available only after the booking is confirmed."); return; }
    setContacts((current) => ({...current,[bookingId]:{name:data[0].full_name,phone:data[0].phone}}));
  }

  async function recordPayment(bookingId: string) {
    const method = paymentMethods[bookingId] ?? "cash";
    setBusy(`payment-${bookingId}`); setError(null); setNotice(null);
    const {data,error:paymentError} = await supabase.rpc("record_simulated_payment",{p_booking_id:bookingId,p_payment_method:method});
    setBusy(null);
    if (paymentError || !data?.[0]) { setError("The simulated payment could not be recorded. A payment may already exist for this booking."); return; }
    setPaymentReferences((current) => ({...current,[bookingId]:data[0].payment_reference}));
    setNotice("A simulated payment record has been created. No real money was transferred.");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</p>}
      {bookings.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">No bookings yet</h2>
          <p className="mt-2 text-sm text-slate-600">Your ride requests and trip history will appear here.</p>
          <a href="/passenger" className="mt-4 inline-flex text-sm font-semibold text-teal-800 underline underline-offset-4">Find a ride</a>
        </section>
      ) : bookings.map((booking) => {
        const offers = fareOffers.filter((offer) => offer.booking_id === booking.id);
        const bookingEvents = events.filter((event) => event.booking_id === booking.id);
        const bookingPayments = payments.filter((payment) => payment.booking_id === booking.id);
        const contact = contacts[booking.id];
        return (
          <article key={booking.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">{booking.ride_type} ride</p>
                <h2 className="mt-1 text-lg font-bold text-slate-950">Driver: {driverNames[booking.driver_id] ?? "Assigned driver"}</h2>
                <p className="mt-1 text-sm text-slate-600">{booking.passenger_count} passenger(s) · Requested {new Date(booking.created_at).toLocaleString("en-KE")}</p>
              </div>
              <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">{booking.booking_status.replaceAll("_"," ")}</span>
            </div>

            {booking.agreed_fare !== null && <p className="mt-4 text-sm font-semibold text-slate-900">Agreed fare: KES {Number(booking.agreed_fare).toLocaleString("en-KE")}</p>}

            {(booking.booking_status === "requested" || booking.booking_status === "negotiating") && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Fare negotiation</h3>
                <div className="mt-3 space-y-2">
                  {offers.map((offer) => (
                    <div key={offer.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div><p className="text-sm font-semibold text-slate-900">KES {Number(offer.amount).toLocaleString("en-KE")}</p><p className="mt-1 text-xs text-slate-500">{offer.proposed_by === userId ? "Your proposal" : "Driver proposal"} · {offer.offer_status}</p>{offer.message && <p className="mt-1 text-xs text-slate-600">{offer.message}</p>}</div>
                      {offer.offer_status === "proposed" && offer.proposed_by !== userId && <button type="button" disabled={busy === `accept-${offer.id}`} onClick={() => void runAction(`accept-${offer.id}`,() => supabase.rpc("accept_fare",{p_fare_offer_id:offer.id}))} className="min-h-9 rounded-lg bg-teal-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Accept fare</button>}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <label className="flex-1 text-xs font-medium text-slate-600">Your fare proposal (KES)
                    <input type="number" min="0" step="1" value={fareAmounts[booking.id] ?? ""} onChange={(event) => setFareAmounts((current) => ({...current,[booking.id]:event.target.value}))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" />
                  </label>
                  <button type="button" disabled={busy === `fare-${booking.id}`} onClick={() => void proposeFare(booking.id)} className="min-h-10 self-end rounded-lg border border-teal-800 px-4 py-2 text-sm font-semibold text-teal-900 hover:bg-teal-50 disabled:opacity-50">Send proposal</button>
                </div>
              </div>
            )}

            {contactStatuses.includes(booking.booking_status) && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                {contact ? <p className="text-sm text-slate-700">Driver contact: <span className="font-semibold">{contact.name}</span> · {contact.phone ?? "No phone number on file"}</p> : (
                  <button type="button" disabled={busy === `contact-${booking.id}`} onClick={() => void revealContact(booking.id)} className="text-sm font-semibold text-teal-800 underline underline-offset-4">{busy === `contact-${booking.id}` ? "Loading contact…" : "Reveal driver contact"}</button>
                )}
              </div>
            )}

            {booking.booking_status === "fare_agreed" && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Fare agreed. Waiting for the driver to confirm the booking.</p>}

            {bookingPayments.length === 0 && ["confirmed","driver_arriving","picked_up","in_progress","completed"].includes(booking.booking_status) && (
              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-900">Record simulated payment</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">This records an MVP test payment only. It does not initiate a real mobile-money or card transaction.</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <select value={paymentMethods[booking.id] ?? "cash"} onChange={(event) => setPaymentMethods((current) => ({...current,[booking.id]:event.target.value}))} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm">
                    <option value="cash">Cash (simulated record)</option><option value="mobile_money_simulated">Mobile money (simulated)</option><option value="card_simulated">Card (simulated)</option>
                  </select>
                  <button type="button" disabled={busy === `payment-${booking.id}`} onClick={() => void recordPayment(booking.id)} className="min-h-10 rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy === `payment-${booking.id}` ? "Saving…" : "Record payment"}</button>
                </div>
                {paymentReferences[booking.id] && <p className="mt-2 text-xs text-emerald-800">Reference: {paymentReferences[booking.id]}</p>}
              </div>
            )}

            {bookingPayments.length > 0 && (
              <div className="mt-4 rounded-xl bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-900">Payment record</p>
                {bookingPayments.map((payment) => <p key={payment.id} className="mt-1 text-xs text-emerald-900">KES {Number(payment.amount).toLocaleString("en-KE")} · {payment.payment_method.replaceAll("_"," ")} · {payment.payment_status} · {payment.reference}</p>)}
              </div>
            )}

            {bookingEvents.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">Trip activity ({bookingEvents.length})</summary>
                <ol className="mt-3 space-y-2 border-l border-slate-200 pl-4">
                  {bookingEvents.map((event) => <li key={event.id} className="text-xs text-slate-600"><span className="font-semibold text-slate-800">{event.event_type.replaceAll("_"," ")}</span> · {new Date(event.created_at).toLocaleString("en-KE")}{event.description ? <p className="mt-1">{event.description}</p> : null}</li>)}
                </ol>
              </details>
            )}

            {!["completed","cancelled","rejected","expired"].includes(booking.booking_status) && (
              <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
                <input aria-label="Cancellation reason" value={reasons[booking.id] ?? ""} onChange={(event) => setReasons((current) => ({...current,[booking.id]:event.target.value}))} placeholder="Reason for cancelling" className="min-h-10 flex-1 rounded-lg border border-slate-300 px-3 text-sm" />
                <button type="button" disabled={busy === `cancel-${booking.id}` || (reasons[booking.id] ?? "").trim().length < 3} onClick={() => void runAction(`cancel-${booking.id}`,() => supabase.rpc("cancel_booking",{p_booking_id:booking.id,p_reason:reasons[booking.id]}))} className="min-h-10 rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50">Cancel booking</button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
