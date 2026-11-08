-- Adult-only driver eligibility is enforced at application and approval boundaries.
-- Fixtures are created inside this transaction and rolled back.
begin;

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,email_confirmed_at)
values
('11111111-1111-4111-8111-111111111111','authenticated','authenticated','driver-age-underage@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Underage Driver Test"}'::jsonb,now(),now(),now()),
('22222222-2222-4222-8222-222222222222','authenticated','authenticated','driver-age-adult@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Adult Driver Test"}'::jsonb,now(),now(),now()),
('33333333-3333-4333-8333-333333333333','authenticated','authenticated','driver-age-admin@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Verification Admin Test"}'::jsonb,now(),now(),now());

do $profile_constraint$
begin
  begin
    update public.profiles
    set date_of_birth = (current_date - interval '17 years')::date
    where id = '11111111-1111-4111-8111-111111111111';
    raise exception 'Profiles unexpectedly accepted an underage date of birth';
  exception when check_violation then
    null;
  end;
end
$profile_constraint$;

update public.profiles
set date_of_birth = (current_date - interval '18 years')::date
where id = '22222222-2222-4222-8222-222222222222';
update public.profiles set date_of_birth = '1990-01-01'
where id = '33333333-3333-4333-8333-333333333333';

insert into public.driver_profiles(user_id)
values ('11111111-1111-4111-8111-111111111111');
insert into public.admin_profiles(user_id,admin_role)
values ('33333333-3333-4333-8333-333333333333','verification_admin');

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);

do $underage_new_rpc$
begin
  begin
    perform public.submit_driver_application(
      '+254700000111',
      (current_date - interval '17 years')::date,
      'Toyota','Probox','KXX111X','Silver',4::smallint
    );
    raise exception 'Underage driver unexpectedly submitted an application';
  exception when invalid_parameter_value then
    null;
  end;
end
$underage_new_rpc$;

do $underage_legacy_rpc$
begin
  begin
    perform public.submit_driver_application(
      '+254700000111','Toyota','Probox','KXX111X','Silver',4::smallint
    );
    raise exception 'Legacy RPC unexpectedly allowed an underage driver application';
  exception when invalid_parameter_value then
    null;
  end;
end
$underage_legacy_rpc$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
do $underage_approval$
begin
  begin
    perform public.admin_review_driver(
      '11111111-1111-4111-8111-111111111111',
      'verified',
      null
    );
    raise exception 'Administrator unexpectedly verified an underage driver';
  exception when insufficient_privilege then
    null;
  end;
end
$underage_approval$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.submit_driver_application(
  '+254700000222',
  (current_date - interval '18 years')::date,
  'Toyota','Probox','KXX222X','Silver',4::smallint
);

do $adult_date_is_immutable$
begin
  begin
    perform public.submit_driver_application(
      '+254700000222',
      (current_date - interval '19 years')::date,
      'Toyota','Probox','KXX222X','Silver',4::smallint
    );
    raise exception 'Driver changed an already-recorded date of birth';
  exception when invalid_parameter_value then
    null;
  end;
end
$adult_date_is_immutable$;
reset role;

rollback;
