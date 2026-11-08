-- Stage 4.2 role lookup authorization smoke test.
-- Creates temporary fixtures, verifies self-only admin assignment visibility,
-- and rolls back all fixture records.
begin;

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,email_confirmed_at)
values
  ('33333333-3333-4333-8333-333333333333','authenticated','authenticated',
   'role-check-admin@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Role Check Admin"}'::jsonb,now(),now(),now()),
  ('44444444-4444-4444-8444-444444444444','authenticated','authenticated',
   'role-check-other@example.invalid','{"provider":"email","providers":["email"]}'::jsonb,
   '{"full_name":"Role Check Other"}'::jsonb,now(),now(),now());

insert into public.admin_profiles(user_id,admin_role)
values ('33333333-3333-4333-8333-333333333333','operations_admin');

set local role authenticated;

do $test$
declare
  visible_count integer;
begin
  perform set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
  select count(*) into visible_count from public.admin_profiles;
  if visible_count <> 1 then
    raise exception 'Admin cannot read own role assignment';
  end if;

  perform set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
  select count(*) into visible_count from public.admin_profiles;
  if visible_count <> 0 then
    raise exception 'Non-admin can read another admin assignment';
  end if;
end
$test$;

rollback;
