-- 004: Row-level security, least-privilege grants, and private driver document storage.
alter table public.profiles enable row level security;
alter table public.driver_profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.driver_documents enable row level security;
alter table public.driver_presence enable row level security;
alter table public.ride_offers enable row level security;
alter table public.bookings enable row level security;
alter table public.fare_offers enable row level security;
alter table public.trip_locations enable row level security;
alter table public.trip_events enable row level security;
alter table public.cancellations enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.audit_logs enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.payment_records enable row level security;

-- Remove broad default table grants, then expose only intentional reads/writes.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select (id,full_name,avatar_url,account_status,created_at,updated_at) on public.profiles to authenticated;
grant update (full_name,avatar_url) on public.profiles to authenticated;
grant select on public.driver_profiles, public.vehicles, public.ride_offers to authenticated;
grant select on public.driver_documents, public.bookings, public.fare_offers,
  public.trip_locations, public.trip_events, public.cancellations,
  public.notifications, public.reports, public.payment_records to authenticated;
grant update (is_read) on public.notifications to authenticated;
grant insert (reporter_id,reported_user_id,booking_id,category,description) on public.reports to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy "profiles_read_self_or_booking_participant"
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or exists (
    select 1 from public.bookings b
    where (b.passenger_id=(select auth.uid()) and b.driver_id=profiles.id)
       or (b.driver_id=(select auth.uid()) and b.passenger_id=profiles.id)
  )
  or (select private.is_admin())
);

create policy "profiles_update_self"
on public.profiles for update to authenticated
using (id=(select auth.uid()))
with check (id=(select auth.uid()));

create policy "driver_profiles_read_verified_or_self"
on public.driver_profiles for select to authenticated
using (user_id=(select auth.uid()) or verification_status='verified' or (select private.is_admin()));

create policy "vehicles_read_approved_or_owner"
on public.vehicles for select to authenticated
using (vehicle_status='approved' or driver_id=(select auth.uid()) or (select private.is_admin()));

create policy "driver_documents_read_owner_or_admin"
on public.driver_documents for select to authenticated
using (driver_id=(select auth.uid()) or (select private.is_admin()));

create policy "ride_offers_read_open_or_owner"
on public.ride_offers for select to authenticated
using (offer_status in ('open','full') or driver_id=(select auth.uid()) or (select private.is_admin()));

create policy "bookings_read_participants_or_admin"
on public.bookings for select to authenticated
using (passenger_id=(select auth.uid()) or driver_id=(select auth.uid()) or (select private.is_admin()));

create policy "fare_offers_read_booking_participants"
on public.fare_offers for select to authenticated
using (exists (
  select 1 from public.bookings b where b.id=fare_offers.booking_id
  and (b.passenger_id=(select auth.uid()) or b.driver_id=(select auth.uid()) or (select private.is_admin()))
));

create policy "trip_locations_read_active_booking_participants"
on public.trip_locations for select to authenticated
using (exists (
  select 1 from public.bookings b where b.id=trip_locations.booking_id
  and b.booking_status in ('confirmed','driver_arriving','picked_up','in_progress')
  and (b.passenger_id=(select auth.uid()) or b.driver_id=(select auth.uid()) or (select private.is_admin()))
));

create policy "trip_events_read_booking_participants"
on public.trip_events for select to authenticated
using (exists (
  select 1 from public.bookings b where b.id=trip_events.booking_id
  and (b.passenger_id=(select auth.uid()) or b.driver_id=(select auth.uid()) or (select private.is_admin()))
));

create policy "cancellations_read_booking_participants"
on public.cancellations for select to authenticated
using (exists (
  select 1 from public.bookings b where b.id=cancellations.booking_id
  and (b.passenger_id=(select auth.uid()) or b.driver_id=(select auth.uid()) or (select private.is_admin()))
));

create policy "notifications_read_own"
on public.notifications for select to authenticated
using (user_id=(select auth.uid()));
create policy "notifications_update_own"
on public.notifications for update to authenticated
using (user_id=(select auth.uid()))
with check (user_id=(select auth.uid()));

create policy "reports_insert_as_reporter"
on public.reports for insert to authenticated
with check (reporter_id=(select auth.uid()));
create policy "reports_read_reporter_or_admin"
on public.reports for select to authenticated
using (reporter_id=(select auth.uid()) or (select private.is_admin()));

create policy "audit_logs_admin_read"
on public.audit_logs for select to authenticated
using ((select private.is_admin()));

create policy "admin_profiles_self_or_admin_read"
on public.admin_profiles for select to authenticated
using (user_id=(select auth.uid()) or (select private.is_admin()));

create policy "payment_records_read_booking_participants"
on public.payment_records for select to authenticated
using (exists (
  select 1 from public.bookings b where b.id=payment_records.booking_id
  and (b.passenger_id=(select auth.uid()) or b.driver_id=(select auth.uid()) or (select private.is_admin()))
));

-- Exact driver-presence rows are intentionally not granted to authenticated users.
-- Client writes to bookings, fares, presence, trip locations, payments, audit logs,
-- verification status, and admin role assignments are only available through
-- narrowly scoped server-controlled functions or trusted administrative operations.

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'driver-documents','driver-documents',false,10485760,
  array['image/jpeg','image/png','application/pdf']
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create policy "driver_documents_upload_own_folder"
on storage.objects for insert to authenticated
with check (
  bucket_id='driver-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

create policy "driver_documents_read_owner_or_admin"
on storage.objects for select to authenticated
using (
  bucket_id='driver-documents'
  and (
    (storage.foldername(name))[1]=(select auth.uid())::text
    or (select private.is_admin())
  )
);

create policy "driver_documents_update_own_pending"
on storage.objects for update to authenticated
using (
  bucket_id='driver-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
)
with check (
  bucket_id='driver-documents'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

-- Realtime should publish only client-safe tables. Exact live location and private
-- document metadata are excluded. Add tables idempotently if the publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    begin alter publication supabase_realtime add table public.bookings; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.ride_offers; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.trip_events; exception when duplicate_object then null; end;
  end if;
end $$;
