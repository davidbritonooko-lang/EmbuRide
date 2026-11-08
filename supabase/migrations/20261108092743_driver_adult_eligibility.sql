-- 023: Require adult eligibility for driver applications and verification.
create or replace function public.submit_driver_application(
  p_phone text,
  p_date_of_birth date,
  p_vehicle_make text,
  p_vehicle_model text,
  p_registration_number text,
  p_vehicle_color text,
  p_seat_capacity smallint
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user uuid := private.require_active_account();
  v_existing_date_of_birth date;
  v_vehicle_id uuid;
begin
  if p_date_of_birth is null
     or p_date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'Drivers must be at least 18 years old' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_phone, ''))) < 7 or length(trim(p_phone)) > 24 then
    raise exception 'Enter a valid contact phone number' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_vehicle_make, ''))) not between 2 and 80
     or length(trim(coalesce(p_vehicle_model, ''))) not between 1 and 80
     or length(trim(coalesce(p_registration_number, ''))) not between 3 and 24
     or p_seat_capacity not between 1 and 20 then
    raise exception 'Vehicle details are invalid' using errcode = '22023';
  end if;

  select date_of_birth into v_existing_date_of_birth
  from public.profiles
  where id = v_user
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;
  if v_existing_date_of_birth is not null and v_existing_date_of_birth <> p_date_of_birth then
    raise exception 'Date of birth cannot be changed through driver application; contact support' using errcode = '22023';
  end if;

  update public.profiles
  set phone = trim(p_phone),
      date_of_birth = coalesce(date_of_birth, p_date_of_birth)
  where id = v_user;

  insert into public.driver_profiles(user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  insert into public.vehicles(driver_id, make, model, registration_number, color, seat_capacity)
  values (
    v_user,
    trim(p_vehicle_make),
    trim(p_vehicle_model),
    upper(trim(p_registration_number)),
    nullif(trim(coalesce(p_vehicle_color, '')), ''),
    p_seat_capacity
  )
  returning id into v_vehicle_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id)
  values (v_user, 'driver.application_submitted', 'driver_profile', v_user::text);

  return v_vehicle_id;
end;
$function$;

-- Backward-compatible calls use the existing stored DOB and cannot bypass the age check.
create or replace function public.submit_driver_application(
  p_phone text,
  p_vehicle_make text,
  p_vehicle_model text,
  p_registration_number text,
  p_vehicle_color text,
  p_seat_capacity smallint
)
returns uuid
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user uuid := private.require_active_account();
  v_date_of_birth date;
begin
  select date_of_birth into v_date_of_birth
  from public.profiles
  where id = v_user;

  return public.submit_driver_application(
    p_phone,
    v_date_of_birth,
    p_vehicle_make,
    p_vehicle_model,
    p_registration_number,
    p_vehicle_color,
    p_seat_capacity
  );
end;
$function$;

create or replace function public.admin_review_driver(
  p_driver_id uuid,
  p_next_status public.driver_verification_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user uuid := private.require_active_account();
  v_missing_documents integer;
  v_has_approved_vehicle boolean;
  v_date_of_birth date;
begin
  if not exists (
    select 1 from public.admin_profiles
    where user_id = v_user
      and admin_role in ('super_admin', 'verification_admin')
  ) then
    raise exception 'Verification administrator access required' using errcode = '42501';
  end if;

  if p_driver_id = v_user then
    raise exception 'Administrators cannot approve their own driver account' using errcode = '42501';
  end if;
  if p_next_status not in ('under_review', 'verified', 'rejected', 'suspended') then
    raise exception 'Invalid driver review decision' using errcode = '22023';
  end if;
  if p_next_status in ('rejected','suspended') and length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'A reason is required for this driver decision' using errcode = '22023';
  end if;

  if p_next_status = 'verified' then
    select date_of_birth into v_date_of_birth
    from public.profiles
    where id = p_driver_id;

    if v_date_of_birth is null
       or v_date_of_birth > (current_date - interval '18 years')::date then
      raise exception 'Driver must be at least 18 years old before verification' using errcode = '42501';
    end if;

    select count(*) into v_missing_documents
    from (values
      ('national_id'::public.document_type),
      ('driving_licence'::public.document_type),
      ('vehicle_registration'::public.document_type),
      ('vehicle_insurance'::public.document_type)
    ) required(document_type)
    where not exists (
      select 1 from public.driver_documents dd
      where dd.driver_id = p_driver_id
        and dd.document_type = required.document_type
        and dd.verification_status = 'approved'
    );

    select exists (
      select 1 from public.vehicles v
      where v.driver_id = p_driver_id
        and v.vehicle_status = 'approved'
    ) into v_has_approved_vehicle;

    if v_missing_documents > 0 or not v_has_approved_vehicle then
      raise exception 'Driver requires all four approved documents and at least one approved vehicle';
    end if;
  end if;

  update public.driver_profiles
  set verification_status = p_next_status,
      verified_at = case when p_next_status = 'verified' then now() else null end,
      is_available = case when p_next_status = 'verified' then is_available else false end
  where user_id = p_driver_id;

  if not found then
    raise exception 'Driver application not found';
  end if;

  if p_next_status <> 'verified' then
    update public.driver_presence
    set is_online = false,
        current_location = null,
        destination_location = null,
        last_seen_at = now()
    where driver_id = p_driver_id;
  end if;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (
    v_user,
    'driver.reviewed',
    'driver_profile',
    p_driver_id::text,
    jsonb_build_object('status', p_next_status, 'reason', p_reason)
  );
end;
$function$;

revoke all on function public.submit_driver_application(text,date,text,text,text,text,smallint) from public, anon;
revoke all on function public.submit_driver_application(text,text,text,text,text,smallint) from public, anon;
revoke all on function public.admin_review_driver(uuid,public.driver_verification_status,text) from public, anon;
grant execute on function public.submit_driver_application(text,date,text,text,text,text,smallint) to authenticated;
grant execute on function public.submit_driver_application(text,text,text,text,text,smallint) to authenticated;
grant execute on function public.admin_review_driver(uuid,public.driver_verification_status,text) to authenticated;
