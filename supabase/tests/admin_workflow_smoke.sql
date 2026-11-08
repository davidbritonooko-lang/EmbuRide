-- Administrator verification and support workflow smoke test.
-- Temporary users, documents, vehicles and reports are rolled back.
begin;
insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,email_confirmed_at)
values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','authenticated','authenticated','emburide-admin-smoke@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Verification Admin Test"}'::jsonb,now(),now(),now()),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','authenticated','authenticated','emburide-operations-smoke@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Operations Admin Test"}'::jsonb,now(),now(),now()),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','authenticated','authenticated','emburide-driver-smoke@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Verification Driver Test"}'::jsonb,now(),now(),now()),
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','authenticated','authenticated','emburide-reporter-smoke@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Reporter Test"}'::jsonb,now(),now(),now());

insert into public.admin_profiles(user_id,admin_role) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','verification_admin'),
('dddddddd-dddd-4ddd-8ddd-dddddddddddd','operations_admin');
insert into public.driver_profiles(user_id) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into public.vehicles(driver_id,make,model,registration_number,color,seat_capacity,vehicle_status)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Toyota','Probox','KXX999X','White',4,'pending');
insert into public.driver_documents(driver_id,document_type,storage_path,verification_status)
values
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','national_id','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/national-id.pdf','pending'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','driving_licence','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/licence.pdf','approved'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','vehicle_registration','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/registration.pdf','approved'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','vehicle_insurance','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/insurance.pdf','approved');
insert into public.reports(reporter_id,reported_user_id,category,description)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','conduct','Administrative workflow smoke test report.');

set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $verify$
declare v_vehicle uuid; v_document uuid; v_status text;
begin
 select id into v_vehicle from public.vehicles where driver_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 select id into v_document from public.driver_documents where driver_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' and document_type='national_id';
 perform public.admin_review_vehicle(v_vehicle,'approved',null);
 perform public.admin_review_driver_document(v_document,'approved',null);
 perform public.admin_review_driver('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','verified',null);
 select verification_status into v_status from public.driver_profiles where user_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 if v_status <> 'verified' then raise exception 'Driver was not verified'; end if;
end
$verify$;

select set_config('request.jwt.claim.sub','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true);
do $support$
declare v_report uuid; v_status text;
begin
 select id into v_report from public.reports where reporter_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 perform public.admin_update_report_status(v_report,'resolved','Smoke test resolution');
 select report_status into v_status from public.reports where id=v_report;
 if v_status <> 'resolved' then raise exception 'Report was not resolved'; end if;
end
$support$;

select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
do $denial$
begin
 begin
   perform public.admin_update_report_status(gen_random_uuid(),'resolved','unauthorized test');
   raise exception 'Non-admin unexpectedly changed report status';
 exception when insufficient_privilege then null;
 end;
end
$denial$;
reset role;
rollback;
