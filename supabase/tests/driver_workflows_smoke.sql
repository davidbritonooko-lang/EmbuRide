-- Driver onboarding and shared-ride discovery smoke test.
-- All fixture writes are rolled back; no persistent test users or rides remain.
begin;

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,email_confirmed_at)
values (
  '77777777-7777-4777-8777-777777777777',
  'authenticated','authenticated',
  'emburide-stage4-driver@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Stage Four Driver"}'::jsonb,
  now(),now(),now()
);

update public.profiles
set date_of_birth = '1990-01-01'
where id = '77777777-7777-4777-8777-777777777777';

set local role authenticated;
select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);

select public.submit_driver_application(
  '+254700000777','Toyota','Probox','KXX777X','Silver',4::smallint
);

reset role;
update public.driver_profiles
set verification_status='verified', verified_at=now()
where user_id='77777777-7777-4777-8777-777777777777';
update public.vehicles set vehicle_status='approved'
where driver_id='77777777-7777-4777-8777-777777777777';
insert into public.vehicles(driver_id,make,model,registration_number,color,seat_capacity,vehicle_status)
values ('77777777-7777-4777-8777-777777777777','Nissan','Note','KXX778X','Blue',5,'approved');

set local role authenticated;
select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);
select public.set_driver_availability(true);
select public.set_driver_presence(-0.5300,37.4500,null,null,true);
select public.create_shared_ride_offer(
  (select id from public.vehicles
   where driver_id='77777777-7777-4777-8777-777777777777' limit 1),
  -0.5300,37.4500,-0.5400,37.4600,
  now()+interval '2 hours',3::smallint,250::numeric
);

do $test$
declare v_count integer; v_approx_lat double precision; v_nearby_count integer;
begin
  select count(*), max(origin_latitude) into v_count,v_approx_lat
  from public.search_shared_rides(-0.5300,37.4500,-0.5400,37.4600,2000,now(),20);

  if v_count <> 1 then
    raise exception 'Expected one matching shared ride, got %',v_count;
  end if;
  if v_approx_lat is null then
    raise exception 'Shared-ride search did not return approximate route coordinates';
  end if;
  select count(*) into v_nearby_count
  from public.search_nearby_drivers(-0.5300,37.4500,2000,20)
  where driver_id='77777777-7777-4777-8777-777777777777';
  if v_nearby_count <> 1 then
    raise exception 'Nearby driver search returned % rows for a driver with multiple approved vehicles',v_nearby_count;
  end if;

  begin
    perform public.admin_update_report_status(gen_random_uuid(),'resolved','test');
    raise exception 'Non-admin unexpectedly changed a report';
  exception when insufficient_privilege then
    null;
  end;
end
$test$;

select public.set_driver_availability(false);
reset role;

do $privacy$
begin
  if exists (
    select 1 from public.driver_presence
    where driver_id='77777777-7777-4777-8777-777777777777'
      and (is_online or current_location is not null or destination_location is not null)
  ) then
    raise exception 'Driver location was not cleared when going offline';
  end if;
end
$privacy$;

do $acl$
declare v_bad integer;
begin
  select count(*) into v_bad
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (
      'submit_driver_application','register_driver_document','set_driver_availability',
      'create_shared_ride_offer','search_shared_rides','admin_review_driver_document',
      'admin_review_vehicle','admin_review_driver','record_simulated_payment',
      'admin_update_report_status'
    )
    and (not p.prosecdef or has_function_privilege('anon',p.oid,'execute')
         or not has_function_privilege('authenticated',p.oid,'execute'));
  if v_bad <> 0 then
    raise exception 'A new workflow RPC has unsafe execution privileges or is not SECURITY DEFINER';
  end if;
end
$acl$;

rollback;
