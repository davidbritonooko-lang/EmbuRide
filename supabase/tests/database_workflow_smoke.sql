-- EmbuRide transactional integration smoke test.
-- Run with a database role permitted to create auth test users (e.g. SQL editor).
-- All fixtures are rolled back. No permanent auth users or ride records remain.
begin;

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,email_confirmed_at)
values
 ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','emburide-test-passenger@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Test Passenger"}'::jsonb,now(),now(),now()),
 ('22222222-2222-4222-8222-222222222222','authenticated','authenticated','emburide-test-driver@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Test Driver"}'::jsonb,now(),now(),now());

insert into public.driver_profiles(user_id,verification_status,is_available,average_rating)
values ('22222222-2222-4222-8222-222222222222','verified',true,4.8);

insert into public.vehicles(driver_id,make,model,registration_number,color,seat_capacity,vehicle_status)
values ('22222222-2222-4222-8222-222222222222','Toyota','Vitz','TEST-EMB-001','Silver',4,'approved');

insert into public.ride_offers(driver_id,vehicle_id,origin,destination,departure_time,available_seats,suggested_fare)
select '22222222-2222-4222-8222-222222222222',v.id,
 extensions.st_setsrid(extensions.st_makepoint(37.45,-0.53),4326)::extensions.geography,
 extensions.st_setsrid(extensions.st_makepoint(37.31,-0.46),4326)::extensions.geography,
 now()+interval '1 hour',2,250
from public.vehicles v where v.registration_number='TEST-EMB-001';

set local role authenticated;

do $test$
declare
  v_passenger uuid := '11111111-1111-4111-8111-111111111111';
  v_driver uuid := '22222222-2222-4222-8222-222222222222';
  v_booking uuid;
  v_shared_booking uuid;
  v_fare uuid;
  v_offer uuid;
  v_contacts integer;
  v_nearby integer;
  v_status public.booking_status;
  v_seats integer;
begin
  -- Driver presence and approximate nearby search.
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  perform public.set_driver_presence(-0.53::double precision,37.45::double precision,null,null,true);
  select count(*) into v_nearby
  from public.search_nearby_drivers(-0.53::double precision,37.45::double precision,5000,10);
  if v_nearby <> 1 then raise exception 'Nearby driver discovery failed: %',v_nearby; end if;

  -- Passenger creates a private booking and proposes a fare.
  perform set_config('request.jwt.claim.sub',v_passenger::text,true);
  v_booking := public.create_booking(
    v_driver,'private'::public.ride_type,
    -0.531::double precision,37.451::double precision,
    -0.46::double precision,37.31::double precision,
    1::smallint,null::uuid
  );
  v_fare := public.propose_fare(v_booking,350::numeric,'Integration test fare');

  -- Driver accepts fare, confirms and advances the trip.
  perform set_config('request.jwt.claim.sub',v_driver::text,true);
  perform public.accept_fare(v_fare);
  perform public.confirm_booking(v_booking);
  perform public.update_booking_status(v_booking,'driver_arriving'::public.booking_status);
  perform public.record_trip_location(v_booking,-0.529::double precision,37.452::double precision);
  select count(*) into v_contacts from public.get_booking_contact(v_booking);
  if v_contacts <> 1 then raise exception 'Confirmed booking contact access failed'; end if;
  perform public.update_booking_status(v_booking,'picked_up'::public.booking_status);
  perform public.update_booking_status(v_booking,'in_progress'::public.booking_status);
  perform public.update_booking_status(v_booking,'completed'::public.booking_status);
  select booking_status into v_status from public.bookings where id=v_booking;
  if v_status <> 'completed' then raise exception 'Trip completion failed: %',v_status; end if;

  -- Shared booking reserves seats; cancellation releases them.
  perform set_config('request.jwt.claim.sub',v_passenger::text,true);
  select id into v_offer from public.ride_offers where driver_id=v_driver;
  v_shared_booking := public.create_booking(
    v_driver,'shared'::public.ride_type,
    -0.531::double precision,37.451::double precision,
    -0.46::double precision,37.31::double precision,
    1::smallint,v_offer
  );
  perform public.cancel_booking(v_shared_booking,'Integration test cancellation');
  select available_seats into v_seats from public.ride_offers where id=v_offer;
  if v_seats <> 2 then raise exception 'Shared seats were not restored: %',v_seats; end if;

  -- Sensitive live presence is not directly selectable by authenticated clients.
  if has_table_privilege(current_user,'public.driver_presence','SELECT') then
    raise exception 'Authenticated role unexpectedly has direct driver_presence SELECT';
  end if;
end
$test$;

reset role;
rollback;
