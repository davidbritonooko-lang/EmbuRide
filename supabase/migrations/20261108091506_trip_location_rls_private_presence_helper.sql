-- 021: Evaluate driver presence from a private, participant-scoped helper.
create or replace function private.is_driver_presence_fresh(p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  select exists (
    select 1
    from public.driver_presence dp
    where dp.driver_id = p_driver_id
      and dp.is_online
      and dp.last_seen_at > now() - interval '2 minutes'
      and (select private.require_active_account()) is not null
      and exists (
        select 1
        from public.bookings b
        where b.driver_id = dp.driver_id
          and b.booking_status in ('confirmed','driver_arriving','picked_up','in_progress')
          and (
            b.passenger_id = (select auth.uid())
            or b.driver_id = (select auth.uid())
            or (select private.is_admin())
          )
      )
  );
$function$;

revoke all on function private.is_driver_presence_fresh(uuid) from public, anon;
grant execute on function private.is_driver_presence_fresh(uuid) to authenticated;

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
          and (select private.is_driver_presence_fresh(b.driver_id))
        )
      )
  )
);
