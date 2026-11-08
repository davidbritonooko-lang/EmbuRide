-- Verifies live trip location writes, participant-only reads, and post-trip access closure.
-- Fixtures are created inside this transaction and rolled back.
begin;

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,email_confirmed_at)
values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated','trip-location-driver@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Trip Location Driver"}'::jsonb,now(),now(),now()),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','authenticated','authenticated','trip-location-passenger@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Trip Location Passenger"}'::jsonb,now(),now(),now()),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','authenticated','authenticated','trip-location-stranger@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Trip Location Stranger"}'::jsonb,now(),now(),now());

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select public.submit_driver_application('+254700000777','Toyota','Probox','KXX777X','Silver',4::smallint);
reset role;

update public.driver_profiles
set verification_status='verified', verified_at=now()
where user_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
update public.vehicles
set vehicle_status='approved'
where driver_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select public.set_driver_availability(true);
select public.set_driver_presence(-0.5300,37.4500,null,null,true);

select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select set_config(
  'test.booking_id',
  public.create_booking(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','private',
    -0.5300,37.4500,-0.5400,37.4600,1::smallint,null
  )::text,
  true
);

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select set_config(
  'test.fare_offer_id',
  public.propose_fare(current_setting('test.booking_id')::uuid,350::numeric,'Trip location test fare')::text,
  true
);

select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
select public.accept_fare(current_setting('test.fare_offer_id')::uuid);
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select public.confirm_booking(current_setting('test.booking_id')::uuid);
select public.record_trip_location(current_setting('test.booking_id')::uuid,-0.5325,37.4525);
reset role;

-- All statements in this rollback-only fixture share transaction_timestamp().
update public.trip_locations
set recorded_at = now() - interval '1 minute'
where booking_id = current_setting('test.booking_id')::uuid;

do $privileges$
begin
  if not has_function_privilege('authenticated','public.get_latest_trip_location(uuid)','EXECUTE') then
    raise exception 'Authenticated role cannot execute the latest trip location RPC';
  end if;
  if has_function_privilege('anon','public.get_latest_trip_location(uuid)','EXECUTE') then
    raise exception 'Anonymous role can execute the latest trip location RPC';
  end if;
end
$privileges$;

set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $passenger_read$
declare v_location record;
begin
  select * into v_location
  from public.get_latest_trip_location(current_setting('test.booking_id')::uuid);
  if not found then raise exception 'Passenger could not read the active booking location'; end if;
  if abs(v_location.latitude - (-0.5325)) > 0.000001
     or abs(v_location.longitude - 37.4525) > 0.000001 then
    raise exception 'Latest trip location coordinates do not match the recorded point';
  end if;
end
$passenger_read$;

-- Explicitly stopping presence hides the previous point and prevents trip writes.
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select public.set_driver_presence(-0.5325,37.4525,null,null,false);

select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $stopped_presence_read$
begin
  if exists(
    select 1 from public.get_latest_trip_location(current_setting('test.booking_id')::uuid)
  ) then
    raise exception 'Passenger can still read location after driver explicitly stops sharing';
  end if;
end
$stopped_presence_read$;

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $stopped_presence_write$
begin
  begin
    perform public.record_trip_location(current_setting('test.booking_id')::uuid,-0.5330,37.4530);
    raise exception 'Trip location write reactivated explicitly stopped presence';
  exception when insufficient_privilege then
    null;
  end;
end
$stopped_presence_write$;

select public.set_driver_presence(-0.5330,37.4530,null,null,true);
select public.record_trip_location(current_setting('test.booking_id')::uuid,-0.5330,37.4530);

select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $resumed_after_stop_read$
begin
  if not exists(
    select 1 from public.get_latest_trip_location(current_setting('test.booking_id')::uuid)
  ) then
    raise exception 'Passenger cannot read location after driver explicitly resumes sharing';
  end if;
end
$resumed_after_stop_read$;

select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
do $stranger_read$
begin
  if exists(
    select 1 from public.get_latest_trip_location(current_setting('test.booking_id')::uuid)
  ) then
    raise exception 'A non-participant can read the active trip location';
  end if;
end
$stranger_read$;
reset role;

-- Going offline clears presence, hides the last trip point, and blocks new writes.
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select public.set_driver_availability(false);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $offline_read$
begin
  if exists(
    select 1 from public.get_latest_trip_location(current_setting('test.booking_id')::uuid)
  ) then
    raise exception 'Passenger can still read trip location after driver goes offline';
  end if;
end
$offline_read$;

select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $offline_write$
begin
  begin
    perform public.record_trip_location(current_setting('test.booking_id')::uuid,-0.5330,37.4530);
    raise exception 'An offline driver was able to publish a trip location';
  exception when insufficient_privilege then
    null;
  end;
end
$offline_write$;
select public.set_driver_availability(true);
select public.set_driver_presence(-0.5330,37.4530,null,null,true);
select public.record_trip_location(current_setting('test.booking_id')::uuid,-0.5330,37.4530);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $resumed_read$
declare v_location record;
begin
  select * into v_location
  from public.get_latest_trip_location(current_setting('test.booking_id')::uuid);
  if not found then raise exception 'Passenger could not read location after the driver resumed sharing'; end if;
  if abs(v_location.latitude - (-0.5330)) > 0.000001
     or abs(v_location.longitude - 37.4530) > 0.000001 then
    raise exception 'Resumed trip location does not match the latest recorded point';
  end if;
end
$resumed_read$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select public.update_booking_status(current_setting('test.booking_id')::uuid,'driver_arriving');
select public.update_booking_status(current_setting('test.booking_id')::uuid,'picked_up');
select public.update_booking_status(current_setting('test.booking_id')::uuid,'in_progress');
select public.update_booking_status(current_setting('test.booking_id')::uuid,'completed');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $completed_read$
begin
  if exists(
    select 1 from public.get_latest_trip_location(current_setting('test.booking_id')::uuid)
  ) then
    raise exception 'Trip location remains visible after the booking is completed';
  end if;
end
$completed_read$;
reset role;

rollback;
