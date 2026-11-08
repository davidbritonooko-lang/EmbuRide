-- 015: Return one nearby-driver result per driver even when multiple vehicles are approved.
create or replace function public.search_nearby_drivers(
  p_latitude double precision,p_longitude double precision,
  p_radius_meters integer default 10000,p_limit integer default 20
)
returns table (
  driver_id uuid,display_name text,vehicle_make text,vehicle_model text,vehicle_color text,
  seat_capacity smallint,distance_meters integer,average_rating numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare v_user uuid := private.require_active_account(); v_origin extensions.geography(point,4326);
begin
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Invalid coordinates' using errcode='22023'; end if;
  if p_radius_meters < 100 or p_radius_meters > 50000 then raise exception 'Radius out of range' using errcode='22023'; end if;
  v_origin := extensions.st_setsrid(extensions.st_makepoint(p_longitude,p_latitude),4326)::extensions.geography;
  return query
  select dp.user_id,p.full_name,v.make,v.model,v.color,v.seat_capacity,
    extensions.st_distance(pr.current_location,v_origin)::integer,dp.average_rating
  from public.driver_presence pr
  join public.driver_profiles dp on dp.user_id=pr.driver_id
  join public.profiles p on p.id=dp.user_id and p.account_status='active'
  join lateral (
    select vehicle.make,vehicle.model,vehicle.color,vehicle.seat_capacity
    from public.vehicles vehicle
    where vehicle.driver_id=dp.user_id and vehicle.vehicle_status='approved'
    order by vehicle.seat_capacity desc,vehicle.created_at asc
    limit 1
  ) v on true
  where pr.is_online and pr.last_seen_at > now()-interval '3 minutes'
    and dp.verification_status='verified' and dp.is_available
    and pr.current_location is not null
    and extensions.st_dwithin(pr.current_location,v_origin,p_radius_meters)
  order by extensions.st_distance(pr.current_location,v_origin)
  limit least(greatest(coalesce(p_limit,20),1),50);
end;
$$;
revoke all on function public.search_nearby_drivers(double precision,double precision,integer,integer) from public, anon;
grant execute on function public.search_nearby_drivers(double precision,double precision,integer,integer) to authenticated;
