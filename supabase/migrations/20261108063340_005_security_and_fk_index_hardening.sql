-- Post-apply hardening identified during Supabase advisor verification.
-- Keep driver_presence inaccessible even if a broad table grant is added later.
create policy "driver_presence_no_direct_client_access"
on public.driver_presence
for all
to authenticated
using (false)
with check (false);

-- This project-level event-trigger helper was pre-existing and is not an RPC.
-- Prevent clients from invoking it directly.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- Cover foreign keys identified by the Supabase performance advisor.
create index if not exists audit_logs_actor_id_idx on public.audit_logs(actor_id);
create index if not exists bookings_ride_offer_id_idx on public.bookings(ride_offer_id);
create index if not exists cancellations_cancelled_by_idx on public.cancellations(cancelled_by);
create index if not exists driver_documents_reviewed_by_idx on public.driver_documents(reviewed_by);
create index if not exists fare_offers_proposed_by_idx on public.fare_offers(proposed_by);
create index if not exists payment_records_booking_id_idx on public.payment_records(booking_id);
create index if not exists reports_booking_id_idx on public.reports(booking_id);
create index if not exists reports_reported_user_id_idx on public.reports(reported_user_id);
create index if not exists reports_reporter_id_idx on public.reports(reporter_id);
create index if not exists ride_offers_vehicle_id_idx on public.ride_offers(vehicle_id);
create index if not exists trip_events_created_by_idx on public.trip_events(created_by);
create index if not exists trip_locations_driver_id_idx on public.trip_locations(driver_id);
create index if not exists vehicles_driver_id_idx on public.vehicles(driver_id);
