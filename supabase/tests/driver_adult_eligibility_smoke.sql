-- Driver applications must reject under-18 applicants and accept the exact 18-year cutoff.
begin;

insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,email_confirmed_at)
values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'authenticated',
  'authenticated',
  'driver-age-gate@example.invalid',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Driver Age Gate Test"}'::jsonb,
  now(),now(),now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);

do $underage_driver$
declare v_rejected boolean := false;
begin
  begin
    perform public.submit_driver_application(
      '+254700000778',
      (current_date - interval '17 years')::date,
      'Toyota','Probox','AGE-TEST-17','Silver',4::smallint
    );
  exception when invalid_parameter_value then
    v_rejected := true;
  end;

  if not v_rejected then
    raise exception 'A driver younger than 18 was not rejected';
  end if;
  if exists (
    select 1 from public.driver_profiles
    where user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ) then
    raise exception 'An underage driver profile was created';
  end if;
end
$underage_driver$;

select public.submit_driver_application(
  '+254700000778',
  (current_date - interval '18 years')::date,
  'Toyota','Probox','AGE-TEST-18','Silver',4::smallint
);

do $adult_driver$
begin
  if not exists (
    select 1 from public.driver_profiles
    where user_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      and verification_status='pending'
  ) then
    raise exception 'An exactly-18-year-old applicant was not accepted into the pending workflow';
  end if;
  if not exists (
    select 1 from public.vehicles
    where driver_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'
      and registration_number='AGE-TEST-18'
  ) then
    raise exception 'The adult applicant vehicle was not recorded';
  end if;
end
$adult_driver$;

reset role;
rollback;
