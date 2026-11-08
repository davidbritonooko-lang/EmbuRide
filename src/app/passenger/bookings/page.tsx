import Link from "next/link";
import { PassengerBookings } from "@/components/passenger/passenger-bookings";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

export default async function PassengerBookingsPage() {
  const user = await requireRole("passenger");
  const supabase = await createClient();
  const { data: bookings } = await supabase.from("bookings")
    .select("id, driver_id, ride_type, passenger_count, agreed_fare, booking_status, created_at")
    .eq("passenger_id", user.id).order("created_at",{ascending:false}).limit(50);
  const ids = (bookings ?? []).map((booking) => booking.id);
  const driverIds = [...new Set((bookings ?? []).map((booking) => booking.driver_id))];

  const [driverResult, fareResult, eventResult, paymentResult] = await Promise.all([
    driverIds.length > 0 ? supabase.from("profiles").select("id,full_name").in("id",driverIds) : Promise.resolve({data:[]}),
    ids.length > 0 ? supabase.from("fare_offers").select("id,booking_id,proposed_by,amount,message,offer_status,created_at").in("booking_id",ids).order("created_at",{ascending:true}) : Promise.resolve({data:[]}),
    ids.length > 0 ? supabase.from("trip_events").select("id,booking_id,event_type,description,created_at").in("booking_id",ids).order("created_at",{ascending:true}) : Promise.resolve({data:[]}),
    ids.length > 0 ? supabase.from("payment_records").select("id,booking_id,amount,payment_method,payment_status,reference,created_at").in("booking_id",ids).order("created_at",{ascending:false}) : Promise.resolve({data:[]}),
  ]);

  const driverNames = Object.fromEntries((driverResult.data ?? []).map((profile) => [profile.id,profile.full_name]));

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-teal-800">Passenger workspace</p><h1 className="mt-2 text-2xl font-bold text-slate-950 sm:text-3xl">My bookings</h1><p className="mt-2 text-sm text-slate-600">Track requests, negotiate fares and review trip activity.</p></div>
        <Link href="/passenger" className="text-sm font-semibold text-teal-800 underline underline-offset-4">Find another ride</Link>
      </section>
      <PassengerBookings userId={user.id} bookings={bookings ?? []} driverNames={driverNames} fareOffers={fareResult.data ?? []} events={eventResult.data ?? []} payments={paymentResult.data ?? []} />
    </div>
  );
}
