-- Passenger booking, driver rejection, fare agreement and simulated-payment smoke test.
-- All fixtures are created inside this transaction and rolled back.
begin;
insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,email_confirmed_at)
values
('88888888-8888-4888-8888-888888888888','authenticated','authenticated','emburide-stage4-driver2@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Booking Driver Test"}'::jsonb,now(),now(),now()),
('99999999-9999-4999-8999-999999999999','authenticated','authenticated','emburide-stage4-passenger2@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Booking Passenger Test"}'::jsonb,now(),now(),now());

set local role authenticated;
select set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
select public.submit_driver_application('+254700000888','Toyota','Probox','KXX888X','Silver',4::smallint);
reset role;
update public.driver_profiles set verification_status='verified',verified_at=now()
where user_id='88888888-8888-4888-8888-888888888888';
update public.vehicles set vehicle_status='approved'
where driver_id='88888888-8888-4888-8888-888888888888';

set local role authenticated;
select set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
select public.set_driver_availability(true);
select public.set_driver_presence(-0.5300,37.4500,null,null,true);

do $test$
declare v_offer uuid; v_shared_booking uuid; v_private_booking uuid; v_fare uuid; v_seats smallint; v_payment_count integer;
begin
  v_offer := public.create_shared_ride_offer(
    (select id from public.vehicles where driver_id='88888888-8888-4888-8888-888888888888' limit 1),
    -0.5300,37.4500,-0.5400,37.4600,now()+interval '2 hours',3::smallint,250::numeric
  );
  perform set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
  v_shared_booking := public.create_booking('88888888-8888-4888-8888-888888888888','shared',
    -0.5300,37.4500,-0.5400,37.4600,1::smallint,v_offer);
  perform set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
  perform public.reject_booking(v_shared_booking,'Driver unavailable at that time');
  select available_seats into v_seats from public.ride_offers where id=v_offer;
  if v_seats <> 3 then raise exception 'Rejected shared booking did not restore its seat'; end if;

  perform set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
  v_private_booking := public.create_booking('88888888-8888-4888-8888-888888888888','private',
    -0.5300,37.4500,-0.5400,37.4600,1::smallint,null);
  perform set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
  v_fare := public.propose_fare(v_private_booking,350::numeric,'Test fare');
  perform set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
  perform public.accept_fare(v_fare);
  perform set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
  perform public.confirm_booking(v_private_booking);
  perform set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',true);
  perform * from public.record_simulated_payment(v_private_booking,'mobile_money_simulated');
  select count(*) into v_payment_count from public.payment_records
  where booking_id=v_private_booking and payment_status='paid_simulated';
  if v_payment_count <> 1 then raise exception 'Expected one simulated payment record'; end if;

  perform set_config('request.jwt.claim.sub','88888888-8888-4888-8888-888888888888',true);
  begin
    perform public.create_booking('88888888-8888-4888-8888-888888888888','private',
      -0.5300,37.4500,-0.5400,37.4600,1::smallint,null);
    raise exception 'Driver account unexpectedly created a passenger booking';
  exception when insufficient_privilege then null;
  end;
end
$test$;
reset role;
rollback;
