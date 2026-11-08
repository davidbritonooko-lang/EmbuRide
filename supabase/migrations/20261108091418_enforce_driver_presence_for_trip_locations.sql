-- 020: Require a verified, available driver for trip-location writes.
-- Passenger/driver reads also require a fresh active presence; admins retain
-- access to active-trip records for operational review.
create or replace function public.record_trip_location(
  p_booking_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'extensions'
as $function$
declare
  v_user uuid := private.require_active_account();
  v_booking public.bookings%rowtype;
  v_location extensions.geography(point,4326);
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Invalid coordinates' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.driver_profiles d
    where d.user_id = v_user
      and d.verification_status = 'verified'
      and d.is_available
  ) then
    raise exception 'A verified, available driver is required to share trip location' using errcode = '42501';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id;

  if not found or v_user <> v_booking.driver_id then
    raise exception 'Only the assigned driver may share trip location' using errcode = '42501';
  end if;
  if v_booking.booking_status not in ('confirmed','driver_arriving','picked_up','in_progress') then
    raise exception 'Location sharing is not active' using errcode = '42501';
  end if;

  v_location := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude,p_latitude),4326
  )::extensions.geography;

  insert into public.trip_locations(booking_id,driver_id,location)
  values(p_booking_id,v_user,v_location);

  insert into public.driver_presence(driver_id,current_location,last_seen_at,is_online)
  values(v_user,v_location,now(),true)
  on conflict (driver_id) do update set
    current_location = excluded.current_location,
    last_seen_at = now(),
    is_online = true,
    updated_at = now();
end;
$function$;

drop policy if exists trip_locations_read_active_booking_participants on public.trip_locations;

create policy trip_locations_read_active_booking_participants
on public.trip_locations
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = trip_locations.booking_id
      and b.booking_status in ('confirmed','driver_arriving','picked_up','in_progress')
      and (
        (select private.is_admin())
        or (
          (b.passenger_id = (select auth.uid()) or b.driver_id = (select auth.uid()))
          and trip_locations.recorded_at > now() - interval '2 minutes'
          and exists (
            select 1
            from public.driver_presence dp
            where dp.driver_id = b.driver_id
              and dp.is_online
              and dp.last_seen_at > now() - interval '2 minutes'
          )
        )
      )
  )
);
