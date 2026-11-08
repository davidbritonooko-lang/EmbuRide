-- Active-account authorization smoke test for privileged ride RPCs.
-- Creates temporary Auth users, proves suspended accounts are rejected,
-- confirms active accounts can still call the search RPC, and rolls back fixtures.
begin;

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,email_confirmed_at)
values
  ('55555555-5555-4555-8555-555555555555','authenticated','authenticated',
   'emburide-suspended-rpc@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Suspended RPC Test"}'::jsonb,now(),now(),now()),
  ('66666666-6666-4666-8666-666666666666','authenticated','authenticated',
   'emburide-active-rpc@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Active RPC Test"}'::jsonb,now(),now(),now());

update public.profiles
set account_status='suspended'
where id='55555555-5555-4555-8555-555555555555';

set local role authenticated;

do $test$
declare
  v_count integer;
begin
  perform set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
  begin
    perform * from public.search_nearby_drivers(-0.53::double precision,37.45::double precision,5000,10);
    raise exception 'Suspended account unexpectedly executed search_nearby_drivers';
  exception
    when insufficient_privilege then
      null;
  end;

  perform set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
  select count(*) into v_count
  from public.search_nearby_drivers(-0.53::double precision,37.45::double precision,5000,10);
  if v_count <> 0 then
    raise exception 'Expected no test drivers, received %', v_count;
  end if;
end
$test$;

reset role;

do $acl$
declare
  v_guarded_count integer;
begin
  select count(*) into v_guarded_count
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.prosecdef
    and p.proname in (
      'accept_fare','cancel_booking','confirm_booking','create_booking',
      'get_booking_contact','propose_fare','record_trip_location',
      'search_nearby_drivers','set_driver_presence','update_booking_status'
    )
    and position('private.require_active_account()' in pg_get_functiondef(p.oid)) > 0;

  if v_guarded_count <> 10 then
    raise exception 'Expected 10 guarded ride RPCs, found %', v_guarded_count;
  end if;

  if has_function_privilege('authenticated','private.require_active_account()','EXECUTE')
     or has_function_privilege('anon','private.require_active_account()','EXECUTE') then
    raise exception 'Clients must not execute the private account guard directly';
  end if;
end
$acl$;

rollback;
