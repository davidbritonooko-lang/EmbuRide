-- 018: Expose the latest active-trip location through participant-protected RLS.
create or replace function public.get_latest_trip_location(p_booking_id uuid)
returns table (
  booking_id uuid,
  latitude double precision,
  longitude double precision,
  recorded_at timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog, public, extensions
as $function$
  select
    tl.booking_id,
    extensions.st_y(tl.location::extensions.geometry) as latitude,
    extensions.st_x(tl.location::extensions.geometry) as longitude,
    tl.recorded_at
  from public.trip_locations tl
  where tl.booking_id = p_booking_id
    and exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and p.account_status = 'active'
    )
  order by tl.recorded_at desc
  limit 1;
$function$;

revoke all on function public.get_latest_trip_location(uuid) from public, anon;
grant execute on function public.get_latest_trip_location(uuid) to authenticated;
