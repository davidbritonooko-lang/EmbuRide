-- 011: Bind booking requests to the advertised pickup and destination areas.
create or replace function public.create_booking(
  p_driver_id uuid, p_ride_type public.ride_type,
  p_pickup_latitude double precision, p_pickup_longitude double precision,
  p_destination_latitude double precision, p_destination_longitude double precision,
  p_passenger_count smallint default 1, p_ride_offer_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare
  v_user uuid := private.require_active_account();
  v_booking_id uuid;
  v_offer public.ride_offers%rowtype;
  v_pickup extensions.geography(point,4326);
  v_destination extensions.geography(point,4326);
  v_capacity smallint;
  v_driver_distance double precision;
begin
  if exists (select 1 from public.driver_profiles where user_id = v_user)
     or exists (select 1 from public.admin_profiles where user_id = v_user) then
    raise exception 'Only passenger accounts can create ride requests' using errcode = '42501';
  end if;
  if p_driver_id = v_user then raise exception 'You cannot request a ride from your own driver account' using errcode = '42501'; end if;
  if p_passenger_count is null or p_passenger_count < 1 or p_passenger_count > 20 then raise exception 'Invalid passenger count' using errcode = '22023'; end if;
  if p_pickup_latitude not between -90 and 90 or p_destination_latitude not between -90 and 90
     or p_pickup_longitude not between -180 and 180 or p_destination_longitude not between -180 and 180 then
    raise exception 'Invalid coordinates' using errcode = '22023';
  end if;
  v_pickup := extensions.st_setsrid(extensions.st_makepoint(p_pickup_longitude,p_pickup_latitude),4326)::extensions.geography;
  v_destination := extensions.st_setsrid(extensions.st_makepoint(p_destination_longitude,p_destination_latitude),4326)::extensions.geography;
  if p_ride_type = 'shared' then
    if p_ride_offer_id is null then raise exception 'Shared booking requires a ride offer'; end if;
    select * into v_offer from public.ride_offers where id = p_ride_offer_id for update;
    if not found or v_offer.driver_id <> p_driver_id or v_offer.offer_status <> 'open'
       or v_offer.departure_time < now() or v_offer.available_seats < p_passenger_count then
      raise exception 'Ride offer unavailable or insufficient seats';
    end if;
    if not extensions.st_dwithin(v_offer.origin, v_pickup, 5000)
       or not extensions.st_dwithin(v_offer.destination, v_destination, 5000) then
      raise exception 'Pickup and destination must be within 5 km of the shared ride route' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.driver_profiles d
      join public.profiles p on p.id = d.user_id
      join public.vehicles v on v.driver_id = d.user_id and v.id = v_offer.vehicle_id
      where d.user_id = p_driver_id and d.verification_status = 'verified'
        and p.account_status = 'active' and v.vehicle_status = 'approved'
    ) then raise exception 'Shared ride driver or vehicle is not approved'; end if;
    update public.ride_offers
    set available_seats = available_seats - p_passenger_count,
        offer_status = case when available_seats - p_passenger_count = 0
          then 'full'::public.ride_offer_status else offer_status end
    where id = p_ride_offer_id;
  elsif p_ride_type = 'private' then
    if p_ride_offer_id is not null then raise exception 'Private booking cannot reference a shared ride offer'; end if;
    select max(v.seat_capacity), min(extensions.st_distance(pr.current_location, v_pickup))
    into v_capacity, v_driver_distance
    from public.driver_profiles d
    join public.profiles p on p.id = d.user_id
    join public.vehicles v on v.driver_id = d.user_id and v.vehicle_status = 'approved'
    join public.driver_presence pr on pr.driver_id = d.user_id
    where d.user_id = p_driver_id and d.verification_status = 'verified'
      and d.is_available and p.account_status = 'active'
      and pr.is_online and pr.last_seen_at > now() - interval '3 minutes'
      and pr.current_location is not null;
    if v_capacity is null then raise exception 'Driver is not currently available with an approved vehicle'; end if;
    if v_driver_distance > 10000 then raise exception 'Driver is too far from the requested pickup point'; end if;
    if p_passenger_count > v_capacity then raise exception 'Passenger count exceeds the approved vehicle capacity'; end if;
  else
    raise exception 'Unsupported ride type' using errcode = '22023';
  end if;
  insert into public.bookings (
    passenger_id, driver_id, ride_offer_id, pickup_location, destination_location,
    ride_type, passenger_count, booking_status, seats_reserved
  ) values (
    v_user, p_driver_id, p_ride_offer_id, v_pickup, v_destination,
    p_ride_type, p_passenger_count, 'requested', p_ride_type = 'shared'
  ) returning id into v_booking_id;
  insert into public.trip_events(booking_id,event_type,description,created_by)
  values (v_booking_id,'booking_requested','Passenger created a booking request',v_user);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values (v_user,'booking.created','booking',v_booking_id::text);
  return v_booking_id;
end;
$$;
revoke all on function public.create_booking(uuid,public.ride_type,double precision,double precision,double precision,double precision,smallint,uuid) from public, anon;
grant execute on function public.create_booking(uuid,public.ride_type,double precision,double precision,double precision,double precision,smallint,uuid) to authenticated;
