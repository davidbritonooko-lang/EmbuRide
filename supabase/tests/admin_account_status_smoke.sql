-- Super-admin account suspension, reactivation and closure smoke test.
-- All test users and records are rolled back.
begin;
insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,email_confirmed_at)
values
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','authenticated','authenticated','emburide-superadmin-smoke@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Super Admin Test"}'::jsonb,now(),now(),now()),
('ffffffff-ffff-4fff-8fff-ffffffffffff','authenticated','authenticated','emburide-account-target@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Account Target Test"}'::jsonb,now(),now(),now()),
('12121212-1212-4212-8212-121212121212','authenticated','authenticated','emburide-ops-target@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Operations Test"}'::jsonb,now(),now(),now());
insert into public.admin_profiles(user_id,admin_role) values
('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','super_admin'),
('12121212-1212-4212-8212-121212121212','operations_admin');
insert into public.driver_profiles(user_id,verification_status,is_available)
values ('ffffffff-ffff-4fff-8fff-ffffffffffff','verified',true);
insert into public.driver_presence(driver_id,current_location,destination_location,last_seen_at,is_online)
values ('ffffffff-ffff-4fff-8fff-ffffffffffff',
 extensions.st_setsrid(extensions.st_makepoint(37.45,-0.53),4326)::extensions.geography,
 extensions.st_setsrid(extensions.st_makepoint(37.46,-0.54),4326)::extensions.geography,now(),true);

set local role authenticated;
select set_config('request.jwt.claim.sub','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',true);
select public.admin_set_account_status('ffffffff-ffff-4fff-8fff-ffffffffffff','suspended','Security review');
select public.admin_set_account_status('ffffffff-ffff-4fff-8fff-ffffffffffff','active','Review completed');
select public.admin_set_account_status('ffffffff-ffff-4fff-8fff-ffffffffffff','closed','Account closure approved');

do $closed$
begin
  begin
    perform public.admin_set_account_status('ffffffff-ffff-4fff-8fff-ffffffffffff','active','Attempt reactivation');
    raise exception 'Closed account unexpectedly reactivated';
  exception when raise_exception then
    if sqlerrm = 'Closed account unexpectedly reactivated' then raise; end if;
  end;
  begin
    perform public.admin_set_account_status('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','suspended','Self suspension');
    raise exception 'Super admin unexpectedly changed own status';
  exception when insufficient_privilege then null;
  end;
end
$closed$;

select set_config('request.jwt.claim.sub','12121212-1212-4212-8212-121212121212',true);
do $denial$
begin
  begin
    perform public.admin_set_account_status('ffffffff-ffff-4fff-8fff-ffffffffffff','suspended','Unauthorized test');
    raise exception 'Operations admin unexpectedly changed account status';
  exception when insufficient_privilege then null;
  end;
end
$denial$;
reset role;
do $cleanupcheck$
begin
  if exists(select 1 from public.driver_presence where driver_id='ffffffff-ffff-4fff-8fff-ffffffffffff'
    and (is_online or current_location is not null or destination_location is not null)) then
    raise exception 'Suspending account did not clear presence coordinates';
  end if;
end
$cleanupcheck$;
rollback;
