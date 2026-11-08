-- 003: Indexes, internal helpers, triggers, and transactional operations.
create index driver_presence_location_gix on public.driver_presence using gist (current_location);
create index driver_presence_destination_gix on public.driver_presence using gist (destination_location);
create index ride_offers_origin_gix on public.ride_offers using gist (origin);
create index ride_offers_destination_gix on public.ride_offers using gist (destination);
create index ride_offers_status_departure_idx on public.ride_offers (offer_status, departure_time);
create index ride_offers_driver_idx on public.ride_offers (driver_id);
create index bookings_passenger_created_idx on public.bookings (passenger_id, created_at desc);
create index bookings_driver_created_idx on public.bookings (driver_id, created_at desc);
create index bookings_status_idx on public.bookings (booking_status);
create index fare_offers_booking_created_idx on public.fare_offers (booking_id, created_at);
create index trip_locations_booking_recorded_idx on public.trip_locations (booking_id, recorded_at desc);
create index trip_events_booking_created_idx on public.trip_events (booking_id, created_at);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index driver_documents_driver_idx on public.driver_documents (driver_id);
create index reports_status_created_idx on public.reports (report_status, created_at);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.admin_profiles ap
    where ap.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_admin() from public, anon;
grant usage on schema private to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger driver_profiles_set_updated_at before update on public.driver_profiles
for each row execute function private.set_updated_at();
create trigger vehicles_set_updated_at before update on public.vehicles
for each row execute function private.set_updated_at();
create trigger driver_presence_set_updated_at before update on public.driver_presence
for each row execute function private.set_updated_at();
create trigger ride_offers_set_updated_at before update on public.ride_offers
for each row execute function private.set_updated_at();
create trigger bookings_set_updated_at before update on public.bookings
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'New passenger'),
    new.email
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();


-- Driver presence is written only through this authenticated, owner-scoped RPC.
create or replace function public.set_driver_presence(
  p_latitude double precision,
  p_longitude double precision,
  p_destination_latitude double precision default null,
  p_destination_longitude double precision default null,
  p_is_online boolean default true
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $presence$
declare v_user uuid := (select auth.uid());
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Invalid current coordinates';
  end if;
  if (p_destination_latitude is null) <> (p_destination_longitude is null)
     or (p_destination_latitude is not null and p_destination_latitude not between -90 and 90)
     or (p_destination_longitude is not null and p_destination_longitude not between -180 and 180) then
    raise exception 'Invalid destination coordinates';
  end if;
  if not exists (
    select 1 from public.driver_profiles d
    join public.profiles p on p.id=d.user_id
    where d.user_id=v_user and d.verification_status='verified'
      and d.is_available and p.account_status='active'
  ) then raise exception 'Verified, available driver profile required' using errcode='42501'; end if;

  insert into public.driver_presence(
    driver_id,current_location,destination_location,last_seen_at,is_online
  ) values (
    v_user,
    extensions.st_setsrid(extensions.st_makepoint(p_longitude,p_latitude),4326)::extensions.geography,
    case when p_destination_latitude is null then null
      else extensions.st_setsrid(extensions.st_makepoint(p_destination_longitude,p_destination_latitude),4326)::extensions.geography end,
    now(),p_is_online
  )
  on conflict (driver_id) do update set
    current_location=excluded.current_location,
    destination_location=excluded.destination_location,
    last_seen_at=excluded.last_seen_at,
    is_online=excluded.is_online,
    updated_at=now();
end;
$presence$;
revoke all on function public.set_driver_presence(double precision,double precision,double precision,double precision,boolean) from public, anon;
grant execute on function public.set_driver_presence(double precision,double precision,double precision,double precision,boolean) to authenticated;

-- Safe discovery: returns no exact driver coordinates, phone numbers, or DOB.
create or replace function public.search_nearby_drivers(
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meters integer default 10000,
  p_limit integer default 20
)
returns table (
  driver_id uuid,
  display_name text,
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  seat_capacity smallint,
  distance_meters integer,
  average_rating numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare
  v_origin extensions.geography(point, 4326);
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Invalid coordinates' using errcode = '22023';
  end if;
  if p_radius_meters < 100 or p_radius_meters > 50000 then
    raise exception 'Radius out of range' using errcode = '22023';
  end if;
  v_origin := extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;

  return query
  select dp.user_id, p.full_name, v.make, v.model, v.color, v.seat_capacity,
         extensions.st_distance(pr.current_location, v_origin)::integer,
         dp.average_rating
  from public.driver_presence pr
  join public.driver_profiles dp on dp.user_id = pr.driver_id
  join public.profiles p on p.id = dp.user_id and p.account_status = 'active'
  join public.vehicles v on v.driver_id = dp.user_id and v.vehicle_status = 'approved'
  where pr.is_online
    and pr.last_seen_at > now() - interval '3 minutes'
    and dp.verification_status = 'verified'
    and dp.is_available
    and pr.current_location is not null
    and extensions.st_dwithin(pr.current_location, v_origin, p_radius_meters)
  order by extensions.st_distance(pr.current_location, v_origin)
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;
revoke all on function public.search_nearby_drivers(double precision,double precision,integer,integer) from public, anon;
grant execute on function public.search_nearby_drivers(double precision,double precision,integer,integer) to authenticated;

-- Create booking and reserve shared seats atomically under a row lock.
create or replace function public.create_booking(
  p_driver_id uuid,
  p_ride_type public.ride_type,
  p_pickup_latitude double precision,
  p_pickup_longitude double precision,
  p_destination_latitude double precision,
  p_destination_longitude double precision,
  p_passenger_count smallint default 1,
  p_ride_offer_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare
  v_user uuid := (select auth.uid());
  v_booking_id uuid;
  v_offer public.ride_offers%rowtype;
  v_pickup extensions.geography(point,4326);
  v_destination extensions.geography(point,4326);
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_passenger_count < 1 or p_passenger_count > 20 then raise exception 'Invalid passenger count'; end if;
  if p_pickup_latitude not between -90 and 90 or p_destination_latitude not between -90 and 90
     or p_pickup_longitude not between -180 and 180 or p_destination_longitude not between -180 and 180 then
    raise exception 'Invalid coordinates';
  end if;
  if not exists (
    select 1 from public.driver_profiles d join public.profiles p on p.id=d.user_id
    where d.user_id=p_driver_id and d.verification_status='verified' and p.account_status='active'
  ) then raise exception 'Driver is not verified and active'; end if;

  v_pickup := extensions.st_setsrid(extensions.st_makepoint(p_pickup_longitude,p_pickup_latitude),4326)::extensions.geography;
  v_destination := extensions.st_setsrid(extensions.st_makepoint(p_destination_longitude,p_destination_latitude),4326)::extensions.geography;

  if p_ride_type = 'shared' then
    if p_ride_offer_id is null then raise exception 'Shared booking requires a ride offer'; end if;
    select * into v_offer from public.ride_offers where id=p_ride_offer_id for update;
    if not found or v_offer.driver_id <> p_driver_id or v_offer.offer_status <> 'open'
       or v_offer.departure_time < now() or v_offer.available_seats < p_passenger_count then
      raise exception 'Ride offer unavailable or insufficient seats';
    end if;
    update public.ride_offers
      set available_seats=available_seats-p_passenger_count,
          offer_status=case when available_seats-p_passenger_count=0 then 'full'::public.ride_offer_status else offer_status end
      where id=p_ride_offer_id;
  elsif p_ride_offer_id is not null then
    raise exception 'Private booking cannot reference a shared ride offer';
  end if;

  insert into public.bookings (
    passenger_id,driver_id,ride_offer_id,pickup_location,destination_location,
    ride_type,passenger_count,booking_status,seats_reserved
  ) values (
    v_user,p_driver_id,p_ride_offer_id,v_pickup,v_destination,p_ride_type,p_passenger_count,
    'requested',p_ride_type='shared'
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

create or replace function public.propose_fare(p_booking_id uuid,p_amount numeric,p_message text default null)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := (select auth.uid()); v_booking public.bookings%rowtype; v_id uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_amount < 0 then raise exception 'Fare must be non-negative'; end if;
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found or v_user not in (v_booking.passenger_id,v_booking.driver_id) then raise exception 'Booking not found' using errcode='42501'; end if;
  if v_booking.booking_status not in ('requested','negotiating') then raise exception 'Fare negotiation is closed'; end if;
  insert into public.fare_offers(booking_id,proposed_by,amount,message)
  values(p_booking_id,v_user,p_amount,left(p_message,500)) returning id into v_id;
  update public.bookings set booking_status='negotiating' where id=p_booking_id;
  insert into public.trip_events(booking_id,event_type,description,created_by)
  values(p_booking_id,'fare_proposed','A fare proposal was submitted',v_user);
  return v_id;
end;
$$;
revoke all on function public.propose_fare(uuid,numeric,text) from public, anon;
grant execute on function public.propose_fare(uuid,numeric,text) to authenticated;

create or replace function public.accept_fare(p_fare_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := (select auth.uid()); v_offer public.fare_offers%rowtype; v_booking public.bookings%rowtype;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_offer from public.fare_offers where id=p_fare_offer_id for update;
  if not found then raise exception 'Fare offer not found'; end if;
  select * into v_booking from public.bookings where id=v_offer.booking_id for update;
  if v_user not in (v_booking.passenger_id,v_booking.driver_id) or v_user=v_offer.proposed_by then
    raise exception 'Only the other booking participant can accept this offer' using errcode='42501';
  end if;
  if v_booking.booking_status <> 'negotiating' or v_offer.offer_status <> 'proposed' then
    raise exception 'Offer is no longer available';
  end if;
  update public.fare_offers set offer_status='rejected'
    where booking_id=v_booking.id and offer_status='proposed';
  update public.fare_offers set offer_status='accepted' where id=p_fare_offer_id;
  update public.bookings set agreed_fare=v_offer.amount, booking_status='fare_agreed' where id=v_booking.id;
  insert into public.trip_events(booking_id,event_type,description,created_by)
  values(v_booking.id,'fare_agreed','Both parties accepted the fare',v_user);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values(v_user,'fare.accepted','booking',v_booking.id::text);
end;
$$;
revoke all on function public.accept_fare(uuid) from public, anon;
grant execute on function public.accept_fare(uuid) to authenticated;

create or replace function public.confirm_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := (select auth.uid()); v_booking public.bookings%rowtype;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found or v_user <> v_booking.driver_id then raise exception 'Only assigned driver can confirm' using errcode='42501'; end if;
  if v_booking.booking_status <> 'fare_agreed' or v_booking.agreed_fare is null then raise exception 'Fare must be agreed first'; end if;
  update public.bookings set booking_status='confirmed',confirmed_at=now() where id=p_booking_id;
  insert into public.trip_events(booking_id,event_type,description,created_by)
  values(p_booking_id,'booking_confirmed','Driver confirmed the booking',v_user);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values(v_user,'booking.confirmed','booking',p_booking_id::text);
end;
$$;
revoke all on function public.confirm_booking(uuid) from public, anon;
grant execute on function public.confirm_booking(uuid) to authenticated;

create or replace function public.cancel_booking(p_booking_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := (select auth.uid()); v_booking public.bookings%rowtype;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Cancellation reason is required'; end if;
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found or v_user not in (v_booking.passenger_id,v_booking.driver_id) then raise exception 'Booking not found' using errcode='42501'; end if;
  if v_booking.booking_status in ('completed','cancelled','rejected','expired') then raise exception 'Booking cannot be cancelled'; end if;
  update public.bookings set booking_status='cancelled',seats_reserved=false where id=p_booking_id;
  insert into public.cancellations(booking_id,cancelled_by,reason) values(p_booking_id,v_user,left(trim(p_reason),1000));
  if v_booking.seats_reserved and v_booking.ride_offer_id is not null then
    update public.ride_offers set available_seats=available_seats+v_booking.passenger_count,offer_status='open'
    where id=v_booking.ride_offer_id and offer_status in ('open','full');
  end if;
  insert into public.trip_events(booking_id,event_type,description,created_by)
  values(p_booking_id,'booking_cancelled',left(trim(p_reason),1000),v_user);
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_user,'booking.cancelled','booking',p_booking_id::text,jsonb_build_object('reason',left(trim(p_reason),1000)));
end;
$$;
revoke all on function public.cancel_booking(uuid,text) from public, anon;
grant execute on function public.cancel_booking(uuid,text) to authenticated;

create or replace function public.update_booking_status(p_booking_id uuid,p_next_status public.booking_status)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := (select auth.uid()); v_booking public.bookings%rowtype;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found or v_user <> v_booking.driver_id then raise exception 'Only assigned driver can update trip status' using errcode='42501'; end if;
  if not (
    (v_booking.booking_status='confirmed' and p_next_status='driver_arriving') or
    (v_booking.booking_status='driver_arriving' and p_next_status='picked_up') or
    (v_booking.booking_status='picked_up' and p_next_status='in_progress') or
    (v_booking.booking_status='in_progress' and p_next_status='completed')
  ) then raise exception 'Invalid booking status transition'; end if;
  update public.bookings set booking_status=p_next_status,
    started_at=case when p_next_status='in_progress' then now() else started_at end,
    completed_at=case when p_next_status='completed' then now() else completed_at end
    where id=p_booking_id;
  insert into public.trip_events(booking_id,event_type,description,created_by)
  values(p_booking_id,'status_'||p_next_status::text,'Booking status changed',v_user);
  if p_next_status='completed' then
    update public.driver_profiles set completed_trips=completed_trips+1 where user_id=v_booking.driver_id;
    update public.driver_presence set is_online=false where driver_id=v_booking.driver_id;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values(v_user,'booking.status_changed','booking',p_booking_id::text);
end;
$$;
revoke all on function public.update_booking_status(uuid,public.booking_status) from public, anon;
grant execute on function public.update_booking_status(uuid,public.booking_status) to authenticated;

create or replace function public.record_trip_location(p_booking_id uuid,p_latitude double precision,p_longitude double precision)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare v_user uuid := (select auth.uid()); v_booking public.bookings%rowtype;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
  select * into v_booking from public.bookings where id=p_booking_id;
  if not found or v_user <> v_booking.driver_id then raise exception 'Only assigned driver may share trip location' using errcode='42501'; end if;
  if v_booking.booking_status not in ('confirmed','driver_arriving','picked_up','in_progress') then raise exception 'Location sharing is not active'; end if;
  insert into public.trip_locations(booking_id,driver_id,location)
  values(p_booking_id,v_user,extensions.st_setsrid(extensions.st_makepoint(p_longitude,p_latitude),4326)::extensions.geography);
  update public.driver_presence set current_location=extensions.st_setsrid(extensions.st_makepoint(p_longitude,p_latitude),4326)::extensions.geography,
    last_seen_at=now(),is_online=true where driver_id=v_user;
end;
$$;
revoke all on function public.record_trip_location(uuid,double precision,double precision) from public, anon;
grant execute on function public.record_trip_location(uuid,double precision,double precision) to authenticated;

create or replace function public.get_booking_contact(p_booking_id uuid)
returns table (user_id uuid, full_name text, phone text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_user uuid := (select auth.uid()); v_booking public.bookings%rowtype;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_booking from public.bookings where id=p_booking_id;
  if not found or v_user not in (v_booking.passenger_id,v_booking.driver_id)
     or v_booking.booking_status not in ('confirmed','driver_arriving','picked_up','in_progress') then
    raise exception 'Contact details are available only to confirmed booking participants' using errcode='42501';
  end if;
  return query
  select p.id,p.full_name,p.phone from public.profiles p
  where p.id in (v_booking.passenger_id,v_booking.driver_id) and p.id <> v_user;
end;
$$;
revoke all on function public.get_booking_contact(uuid) from public, anon;
grant execute on function public.get_booking_contact(uuid) to authenticated;
