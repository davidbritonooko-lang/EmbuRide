-- 009: Authenticated driver onboarding, shared ride publishing/search, and admin review RPCs.
-- All writes remain server-authorized; client roles receive execute on narrowly scoped functions only.

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
set search_path = pg_catalog, public, private
as $$
declare
  v_user uuid := private.require_active_account();
  v_vehicle_id uuid;
begin
  if length(trim(coalesce(p_phone, ''))) < 7 or length(trim(p_phone)) > 24 then
    raise exception 'Enter a valid contact phone number' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_vehicle_make, ''))) not between 2 and 80
     or length(trim(coalesce(p_vehicle_model, ''))) not between 1 and 80
     or length(trim(coalesce(p_registration_number, ''))) not between 3 and 24
     or p_seat_capacity not between 1 and 20 then
    raise exception 'Vehicle details are invalid' using errcode = '22023';
  end if;

  update public.profiles set phone = trim(p_phone) where id = v_user;
  insert into public.driver_profiles(user_id) values (v_user) on conflict (user_id) do nothing;

  insert into public.vehicles(driver_id, make, model, registration_number, color, seat_capacity)
  values (v_user, trim(p_vehicle_make), trim(p_vehicle_model), upper(trim(p_registration_number)),
          nullif(trim(coalesce(p_vehicle_color, '')), ''), p_seat_capacity)
  returning id into v_vehicle_id;

  insert into public.audit_logs(actor_id, action, entity_type, entity_id)
  values (v_user, 'driver.application_submitted', 'driver_profile', v_user::text);
  return v_vehicle_id;
end;
$$;
revoke all on function public.submit_driver_application(text,text,text,text,text,smallint) from public, anon;
grant execute on function public.submit_driver_application(text,text,text,text,text,smallint) to authenticated;

create or replace function public.register_driver_document(p_document_type public.document_type, p_storage_path text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private, storage
as $$
declare v_user uuid := private.require_active_account(); v_document_id uuid;
begin
  if not exists (select 1 from public.driver_profiles where user_id = v_user) then
    raise exception 'Submit a driver application before uploading documents';
  end if;
  if p_storage_path is null or split_part(p_storage_path, '/', 1) <> v_user::text then
    raise exception 'Document must be stored in your private folder' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'driver-documents' and name = p_storage_path) then
    raise exception 'Uploaded document was not found in private storage';
  end if;
  insert into public.driver_documents(driver_id, document_type, storage_path)
  values (v_user, p_document_type, p_storage_path) returning id into v_document_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (v_user, 'driver.document_submitted', 'driver_document', v_document_id::text,
          jsonb_build_object('document_type', p_document_type));
  return v_document_id;
end;
$$;
revoke all on function public.register_driver_document(public.document_type,text) from public, anon;
grant execute on function public.register_driver_document(public.document_type,text) to authenticated;

create or replace function public.set_driver_availability(p_is_available boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := private.require_active_account();
begin
  update public.driver_profiles set is_available = p_is_available
  where user_id = v_user and verification_status = 'verified';
  if not found then raise exception 'Only verified drivers can change availability' using errcode = '42501'; end if;
  if not p_is_available then
    update public.driver_presence set current_location = null, destination_location = null,
      is_online = false, last_seen_at = now() where driver_id = v_user;
  end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (v_user, 'driver.availability_changed', 'driver_profile', v_user::text,
          jsonb_build_object('is_available', p_is_available));
end;
$$;
revoke all on function public.set_driver_availability(boolean) from public, anon;
grant execute on function public.set_driver_availability(boolean) to authenticated;

create or replace function public.create_shared_ride_offer(
  p_vehicle_id uuid, p_origin_latitude double precision, p_origin_longitude double precision,
  p_destination_latitude double precision, p_destination_longitude double precision,
  p_departure_time timestamptz, p_available_seats smallint, p_suggested_fare numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare v_user uuid := private.require_active_account(); v_capacity smallint; v_offer_id uuid;
begin
  if p_origin_latitude not between -90 and 90 or p_destination_latitude not between -90 and 90
     or p_origin_longitude not between -180 and 180 or p_destination_longitude not between -180 and 180 then
    raise exception 'Route coordinates are invalid' using errcode = '22023';
  end if;
  if p_departure_time is null or p_departure_time <= now() then
    raise exception 'Departure time must be in the future' using errcode = '22023';
  end if;
  if p_suggested_fare is not null and p_suggested_fare < 0 then
    raise exception 'Suggested fare cannot be negative' using errcode = '22023';
  end if;
  select v.seat_capacity into v_capacity
  from public.vehicles v join public.driver_profiles d on d.user_id = v.driver_id
  where v.id = p_vehicle_id and v.driver_id = v_user and v.vehicle_status = 'approved'
    and d.verification_status = 'verified';
  if not found then raise exception 'An approved vehicle and verified driver profile are required' using errcode = '42501'; end if;
  if p_available_seats < 1 or p_available_seats > v_capacity then
    raise exception 'Available seats exceed the approved vehicle capacity' using errcode = '22023';
  end if;
  insert into public.ride_offers(driver_id, vehicle_id, origin, destination, departure_time,
                                available_seats, suggested_fare, offer_status)
  values (v_user, p_vehicle_id,
    extensions.st_setsrid(extensions.st_makepoint(p_origin_longitude, p_origin_latitude), 4326)::extensions.geography,
    extensions.st_setsrid(extensions.st_makepoint(p_destination_longitude, p_destination_latitude), 4326)::extensions.geography,
    p_departure_time, p_available_seats, p_suggested_fare, 'open')
  returning id into v_offer_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id)
  values (v_user, 'ride_offer.created', 'ride_offer', v_offer_id::text);
  return v_offer_id;
end;
$$;
revoke all on function public.create_shared_ride_offer(uuid,double precision,double precision,double precision,double precision,timestamptz,smallint,numeric) from public, anon;
grant execute on function public.create_shared_ride_offer(uuid,double precision,double precision,double precision,double precision,timestamptz,smallint,numeric) to authenticated;

create or replace function public.search_shared_rides(
  p_origin_latitude double precision, p_origin_longitude double precision,
  p_destination_latitude double precision, p_destination_longitude double precision,
  p_radius_meters integer default 15000, p_departure_after timestamptz default now(),
  p_limit integer default 20
)
returns table (
  ride_offer_id uuid, driver_id uuid, driver_name text, vehicle_make text, vehicle_model text,
  vehicle_color text, seat_capacity smallint, departure_time timestamptz, available_seats smallint,
  suggested_fare numeric, origin_latitude double precision, origin_longitude double precision,
  destination_latitude double precision, destination_longitude double precision, average_rating numeric
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions, private
as $$
declare v_origin extensions.geography(point, 4326); v_destination extensions.geography(point, 4326);
begin
  perform private.require_active_account();
  if p_origin_latitude not between -90 and 90 or p_destination_latitude not between -90 and 90
     or p_origin_longitude not between -180 and 180 or p_destination_longitude not between -180 and 180 then
    raise exception 'Route coordinates are invalid' using errcode = '22023';
  end if;
  if p_radius_meters < 100 or p_radius_meters > 50000 then
    raise exception 'Search radius is out of range' using errcode = '22023';
  end if;
  v_origin := extensions.st_setsrid(extensions.st_makepoint(p_origin_longitude, p_origin_latitude), 4326)::extensions.geography;
  v_destination := extensions.st_setsrid(extensions.st_makepoint(p_destination_longitude, p_destination_latitude), 4326)::extensions.geography;
  return query
  select ro.id, ro.driver_id, p.full_name, v.make, v.model, v.color, v.seat_capacity,
    ro.departure_time, ro.available_seats, ro.suggested_fare,
    round(extensions.st_y(ro.origin::extensions.geometry)::numeric, 3)::double precision,
    round(extensions.st_x(ro.origin::extensions.geometry)::numeric, 3)::double precision,
    round(extensions.st_y(ro.destination::extensions.geometry)::numeric, 3)::double precision,
    round(extensions.st_x(ro.destination::extensions.geometry)::numeric, 3)::double precision,
    dp.average_rating
  from public.ride_offers ro
  join public.driver_profiles dp on dp.user_id = ro.driver_id
  join public.profiles p on p.id = ro.driver_id and p.account_status = 'active'
  join public.vehicles v on v.id = ro.vehicle_id and v.vehicle_status = 'approved'
  where ro.offer_status = 'open' and ro.departure_time >= coalesce(p_departure_after, now())
    and ro.available_seats > 0 and dp.verification_status = 'verified'
    and extensions.st_dwithin(ro.origin, v_origin, p_radius_meters)
    and extensions.st_dwithin(ro.destination, v_destination, p_radius_meters)
  order by ro.departure_time asc, extensions.st_distance(ro.origin, v_origin) asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;
revoke all on function public.search_shared_rides(double precision,double precision,double precision,double precision,integer,timestamptz,integer) from public, anon;
grant execute on function public.search_shared_rides(double precision,double precision,double precision,double precision,integer,timestamptz,integer) to authenticated;

create or replace function public.admin_review_driver_document(
  p_document_id uuid, p_next_status public.document_verification_status, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := private.require_active_account(); v_driver_id uuid;
begin
  if not exists (select 1 from public.admin_profiles where user_id = v_user
                 and admin_role in ('super_admin', 'verification_admin')) then
    raise exception 'Verification administrator access required' using errcode = '42501';
  end if;
  if p_next_status not in ('approved', 'rejected') then raise exception 'Invalid document review decision' using errcode = '22023'; end if;
  if p_next_status = 'rejected' and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required when rejecting a document' using errcode = '22023';
  end if;
  update public.driver_documents set verification_status = p_next_status, reviewed_by = v_user,
    reviewed_at = now(), rejection_reason = case when p_next_status = 'rejected' then left(trim(p_reason), 1000) else null end
  where id = p_document_id returning driver_id into v_driver_id;
  if v_driver_id is null then raise exception 'Driver document not found'; end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (v_user, 'driver_document.reviewed', 'driver_document', p_document_id::text,
          jsonb_build_object('status', p_next_status, 'reason', p_reason));
end;
$$;
revoke all on function public.admin_review_driver_document(uuid,public.document_verification_status,text) from public, anon;
grant execute on function public.admin_review_driver_document(uuid,public.document_verification_status,text) to authenticated;

create or replace function public.admin_review_vehicle(
  p_vehicle_id uuid, p_next_status public.vehicle_status, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := private.require_active_account(); v_driver_id uuid;
begin
  if not exists (select 1 from public.admin_profiles where user_id = v_user
                 and admin_role in ('super_admin', 'verification_admin')) then
    raise exception 'Verification administrator access required' using errcode = '42501';
  end if;
  if p_next_status not in ('approved', 'rejected', 'suspended') then raise exception 'Invalid vehicle review decision' using errcode = '22023'; end if;
  update public.vehicles set vehicle_status = p_next_status
  where id = p_vehicle_id returning driver_id into v_driver_id;
  if v_driver_id is null then raise exception 'Vehicle not found'; end if;
  if p_next_status <> 'approved' then
    update public.driver_profiles set is_available = false where user_id = v_driver_id;
    update public.driver_presence set is_online = false, current_location = null,
      destination_location = null, last_seen_at = now() where driver_id = v_driver_id;
  end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (v_user, 'vehicle.reviewed', 'vehicle', p_vehicle_id::text,
          jsonb_build_object('status', p_next_status, 'reason', p_reason));
end;
$$;
revoke all on function public.admin_review_vehicle(uuid,public.vehicle_status,text) from public, anon;
grant execute on function public.admin_review_vehicle(uuid,public.vehicle_status,text) to authenticated;

create or replace function public.admin_review_driver(
  p_driver_id uuid, p_next_status public.driver_verification_status, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := private.require_active_account(); v_missing_documents integer; v_has_approved_vehicle boolean;
begin
  if not exists (select 1 from public.admin_profiles where user_id = v_user
                 and admin_role in ('super_admin', 'verification_admin')) then
    raise exception 'Verification administrator access required' using errcode = '42501';
  end if;
  if p_driver_id = v_user then raise exception 'Administrators cannot approve their own driver account' using errcode = '42501'; end if;
  if p_next_status not in ('under_review', 'verified', 'rejected', 'suspended') then raise exception 'Invalid driver review decision' using errcode = '22023'; end if;
  if p_next_status = 'rejected' and length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A reason is required when rejecting a driver' using errcode = '22023';
  end if;
  if p_next_status = 'verified' then
    select count(*) into v_missing_documents
    from (values ('national_id'::public.document_type), ('driving_licence'::public.document_type),
                 ('vehicle_registration'::public.document_type), ('vehicle_insurance'::public.document_type)) required(document_type)
    where not exists (select 1 from public.driver_documents dd where dd.driver_id = p_driver_id
                      and dd.document_type = required.document_type and dd.verification_status = 'approved');
    select exists (select 1 from public.vehicles v where v.driver_id = p_driver_id
                   and v.vehicle_status = 'approved') into v_has_approved_vehicle;
    if v_missing_documents > 0 or not v_has_approved_vehicle then
      raise exception 'Driver requires all four approved documents and at least one approved vehicle';
    end if;
  end if;
  update public.driver_profiles set verification_status = p_next_status,
    verified_at = case when p_next_status = 'verified' then now() else null end,
    is_available = case when p_next_status = 'verified' then is_available else false end
  where user_id = p_driver_id;
  if not found then raise exception 'Driver application not found'; end if;
  if p_next_status <> 'verified' then
    update public.driver_presence set is_online = false, current_location = null,
      destination_location = null, last_seen_at = now() where driver_id = p_driver_id;
  end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (v_user, 'driver.reviewed', 'driver_profile', p_driver_id::text,
          jsonb_build_object('status', p_next_status, 'reason', p_reason));
end;
$$;
revoke all on function public.admin_review_driver(uuid,public.driver_verification_status,text) from public, anon;
grant execute on function public.admin_review_driver(uuid,public.driver_verification_status,text) to authenticated;

create or replace function public.record_simulated_payment(p_booking_id uuid, p_payment_method public.payment_method)
returns table(payment_id uuid, payment_reference text)
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := private.require_active_account(); v_booking public.bookings%rowtype;
  v_payment_id uuid; v_reference text;
begin
  if p_payment_method not in ('cash', 'mobile_money_simulated', 'card_simulated') then
    raise exception 'Only MVP simulated payment methods are supported' using errcode = '22023';
  end if;
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found or v_user not in (v_booking.passenger_id, v_booking.driver_id) then
    raise exception 'Booking not found' using errcode = '42501';
  end if;
  if v_booking.booking_status not in ('confirmed', 'driver_arriving', 'picked_up', 'in_progress', 'completed')
     or v_booking.agreed_fare is null then raise exception 'A confirmed booking with an agreed fare is required'; end if;
  if exists (select 1 from public.payment_records where booking_id = p_booking_id and payment_status = 'paid_simulated') then
    raise exception 'A simulated payment has already been recorded';
  end if;
  v_reference := 'SIM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  insert into public.payment_records(booking_id, amount, payment_method, payment_status, reference)
  values (p_booking_id, v_booking.agreed_fare, p_payment_method, 'paid_simulated', v_reference)
  returning id into v_payment_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (v_user, 'payment.simulated', 'payment_record', v_payment_id::text,
          jsonb_build_object('booking_id', p_booking_id, 'reference', v_reference));
  return query select v_payment_id, v_reference;
end;
$$;
revoke all on function public.record_simulated_payment(uuid,public.payment_method) from public, anon;
grant execute on function public.record_simulated_payment(uuid,public.payment_method) to authenticated;

create or replace function public.admin_update_report_status(
  p_report_id uuid, p_next_status public.report_status, p_note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := private.require_active_account();
begin
  if not exists (select 1 from public.admin_profiles where user_id = v_user
                 and admin_role in ('super_admin', 'operations_admin', 'support_admin')) then
    raise exception 'Support or operations administrator access required' using errcode = '42501';
  end if;
  update public.reports set report_status = p_next_status where id = p_report_id;
  if not found then raise exception 'Report not found'; end if;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, details)
  values (v_user, 'report.status_changed', 'report', p_report_id::text,
          jsonb_build_object('status', p_next_status, 'note', p_note));
end;
$$;
revoke all on function public.admin_update_report_status(uuid,public.report_status,text) from public, anon;
grant execute on function public.admin_update_report_status(uuid,public.report_status,text) to authenticated;
