-- 013: Require reasons for adverse verification decisions and clear offline driver coordinates.
create or replace function public.set_driver_availability(p_is_available boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := private.require_active_account();
begin
  if p_is_available and not exists (select 1 from public.vehicles where driver_id=v_user and vehicle_status='approved') then
    raise exception 'At least one approved vehicle is required to go available' using errcode='42501';
  end if;
  update public.driver_profiles set is_available=p_is_available
  where user_id=v_user and verification_status='verified';
  if not found then raise exception 'Only verified drivers can change availability' using errcode='42501'; end if;
  if not p_is_available then
    update public.driver_presence set current_location=null,destination_location=null,is_online=false,last_seen_at=now()
    where driver_id=v_user;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_user,'driver.availability_changed','driver_profile',v_user::text,jsonb_build_object('is_available',p_is_available));
end;
$$;
revoke all on function public.set_driver_availability(boolean) from public, anon;
grant execute on function public.set_driver_availability(boolean) to authenticated;

create or replace function public.set_driver_presence(
  p_latitude double precision,p_longitude double precision,
  p_destination_latitude double precision default null,p_destination_longitude double precision default null,
  p_is_online boolean default true
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $presence$
declare v_user uuid := private.require_active_account();
begin
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Invalid current coordinates'; end if;
  if (p_destination_latitude is null) <> (p_destination_longitude is null)
     or (p_destination_latitude is not null and p_destination_latitude not between -90 and 90)
     or (p_destination_longitude is not null and p_destination_longitude not between -180 and 180) then
    raise exception 'Invalid destination coordinates';
  end if;
  if not exists (
    select 1 from public.driver_profiles d
    join public.profiles p on p.id=d.user_id
    join public.vehicles v on v.driver_id=d.user_id and v.vehicle_status='approved'
    where d.user_id=v_user and d.verification_status='verified' and d.is_available and p.account_status='active'
  ) then raise exception 'Verified, available driver with an approved vehicle required' using errcode='42501'; end if;
  insert into public.driver_presence(driver_id,current_location,destination_location,last_seen_at,is_online)
  values (
    v_user,
    case when p_is_online then extensions.st_setsrid(extensions.st_makepoint(p_longitude,p_latitude),4326)::extensions.geography else null end,
    case when p_is_online and p_destination_latitude is not null
      then extensions.st_setsrid(extensions.st_makepoint(p_destination_longitude,p_destination_latitude),4326)::extensions.geography else null end,
    now(),p_is_online
  )
  on conflict (driver_id) do update set current_location=excluded.current_location,
    destination_location=excluded.destination_location,last_seen_at=excluded.last_seen_at,
    is_online=excluded.is_online,updated_at=now();
end;
$presence$;
revoke all on function public.set_driver_presence(double precision,double precision,double precision,double precision,boolean) from public, anon;
grant execute on function public.set_driver_presence(double precision,double precision,double precision,double precision,boolean) to authenticated;

create or replace function public.admin_review_vehicle(
  p_vehicle_id uuid,p_next_status public.vehicle_status,p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := private.require_active_account(); v_driver_id uuid;
begin
  if not exists (select 1 from public.admin_profiles where user_id=v_user and admin_role in ('super_admin','verification_admin')) then
    raise exception 'Verification administrator access required' using errcode='42501';
  end if;
  if p_next_status not in ('approved','rejected','suspended') then raise exception 'Invalid vehicle review decision' using errcode='22023'; end if;
  if p_next_status in ('rejected','suspended') and length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'A reason is required for this vehicle decision' using errcode='22023';
  end if;
  update public.vehicles set vehicle_status=p_next_status where id=p_vehicle_id returning driver_id into v_driver_id;
  if v_driver_id is null then raise exception 'Vehicle not found'; end if;
  if p_next_status <> 'approved' then
    update public.driver_profiles set is_available=false where user_id=v_driver_id;
    update public.driver_presence set is_online=false,current_location=null,destination_location=null,last_seen_at=now()
    where driver_id=v_driver_id;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_user,'vehicle.reviewed','vehicle',p_vehicle_id::text,jsonb_build_object('status',p_next_status,'reason',p_reason));
end;
$$;
revoke all on function public.admin_review_vehicle(uuid,public.vehicle_status,text) from public, anon;
grant execute on function public.admin_review_vehicle(uuid,public.vehicle_status,text) to authenticated;

create or replace function public.admin_review_driver(
  p_driver_id uuid,p_next_status public.driver_verification_status,p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := private.require_active_account(); v_missing_documents integer; v_has_approved_vehicle boolean;
begin
  if not exists (select 1 from public.admin_profiles where user_id=v_user and admin_role in ('super_admin','verification_admin')) then
    raise exception 'Verification administrator access required' using errcode='42501';
  end if;
  if p_driver_id=v_user then raise exception 'Administrators cannot approve their own driver account' using errcode='42501'; end if;
  if p_next_status not in ('under_review','verified','rejected','suspended') then raise exception 'Invalid driver review decision' using errcode='22023'; end if;
  if p_next_status in ('rejected','suspended') and length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'A reason is required for this driver decision' using errcode='22023';
  end if;
  if p_next_status='verified' then
    select count(*) into v_missing_documents
    from (values ('national_id'::public.document_type),('driving_licence'::public.document_type),
      ('vehicle_registration'::public.document_type),('vehicle_insurance'::public.document_type)) required(document_type)
    where not exists (select 1 from public.driver_documents dd where dd.driver_id=p_driver_id
      and dd.document_type=required.document_type and dd.verification_status='approved');
    select exists(select 1 from public.vehicles v where v.driver_id=p_driver_id and v.vehicle_status='approved')
    into v_has_approved_vehicle;
    if v_missing_documents>0 or not v_has_approved_vehicle then
      raise exception 'Driver requires all four approved documents and at least one approved vehicle';
    end if;
  end if;
  update public.driver_profiles set verification_status=p_next_status,
    verified_at=case when p_next_status='verified' then now() else null end,
    is_available=case when p_next_status='verified' then is_available else false end
  where user_id=p_driver_id;
  if not found then raise exception 'Driver application not found'; end if;
  if p_next_status <> 'verified' then
    update public.driver_presence set is_online=false,current_location=null,destination_location=null,last_seen_at=now()
    where driver_id=p_driver_id;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_user,'driver.reviewed','driver_profile',p_driver_id::text,jsonb_build_object('status',p_next_status,'reason',p_reason));
end;
$$;
revoke all on function public.admin_review_driver(uuid,public.driver_verification_status,text) from public, anon;
grant execute on function public.admin_review_driver(uuid,public.driver_verification_status,text) to authenticated;

create or replace function public.update_booking_status(p_booking_id uuid,p_next_status public.booking_status)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := private.require_active_account(); v_booking public.bookings%rowtype;
begin
  select * into v_booking from public.bookings where id=p_booking_id for update;
  if not found or v_user <> v_booking.driver_id then raise exception 'Only assigned driver can update trip status' using errcode='42501'; end if;
  if not (
    (v_booking.booking_status='confirmed' and p_next_status='driver_arriving') or
    (v_booking.booking_status='driver_arriving' and p_next_status='picked_up') or
    (v_booking.booking_status='picked_up' and p_next_status='in_progress') or
    (v_booking.booking_status='in_progress' and p_next_status='completed')
  ) then raise exception 'Invalid booking status transition'; end if;
  update public.bookings set booking_status=p_next_status,
    started_at=case when p_next_status='in_progress' then now() else started_at end,
    completed_at=case when p_next_status='completed' then now() else completed_at end
  where id=p_booking_id;
  insert into public.trip_events(booking_id,event_type,description,created_by)
  values(p_booking_id,'status_'||p_next_status::text,'Booking status changed',v_user);
  if p_next_status='completed' then
    update public.driver_profiles set completed_trips=completed_trips+1 where user_id=v_booking.driver_id;
    update public.driver_presence set is_online=false,current_location=null,destination_location=null,last_seen_at=now()
    where driver_id=v_booking.driver_id;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values(v_user,'booking.status_changed','booking',p_booking_id::text);
end;
$$;
revoke all on function public.update_booking_status(uuid,public.booking_status) from public, anon;
grant execute on function public.update_booking_status(uuid,public.booking_status) to authenticated;
