-- Profile self-service and notification isolation smoke test.
-- Test users and notifications are rolled back.
begin;
insert into auth.users (id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,email_confirmed_at)
values
('13131313-1313-4313-8313-131313131313','authenticated','authenticated','emburide-profile-a@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Profile A"}'::jsonb,now(),now(),now()),
('14141414-1414-4414-8414-141414141414','authenticated','authenticated','emburide-profile-b@example.invalid',
 '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Profile B"}'::jsonb,now(),now(),now());
insert into public.notifications(user_id,title,message,is_read)
values
('13131313-1313-4313-8313-131313131313','Own notice','Own private notice',false),
('14141414-1414-4414-8414-141414141414','Other notice','Other private notice',false);

set local role authenticated;
select set_config('request.jwt.claim.sub','13131313-1313-4313-8313-131313131313',true);
do $profile$
declare v_name text; v_phone text; v_rows integer;
begin
  select full_name,phone into v_name,v_phone from public.get_own_profile();
  if v_name <> 'Profile A' then raise exception 'Own profile lookup returned wrong user'; end if;
  perform public.update_own_profile('Profile A Updated','+254700000131');
  update public.notifications set is_read=true where user_id='14141414-1414-4414-8414-141414141414';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'A user updated another account notification'; end if;
  update public.notifications set is_read=true where user_id='13131313-1313-4313-8313-131313131313';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'A user could not mark their own notification as read'; end if;
end
$profile$;
reset role;
do $assert$
begin
  if not exists(select 1 from public.profiles where id='13131313-1313-4313-8313-131313131313'
    and full_name='Profile A Updated' and phone='+254700000131') then raise exception 'Self-service profile update did not persist'; end if;
  if exists(select 1 from public.profiles where id='14141414-1414-4414-8414-141414141414'
    and full_name='Profile A Updated') then raise exception 'Profile update changed another user'; end if;
  if not exists(select 1 from public.notifications where user_id='13131313-1313-4313-8313-131313131313' and is_read) then
    raise exception 'Own notification was not marked read';
  end if;
  if not exists(select 1 from public.notifications where user_id='14141414-1414-4414-8414-141414141414' and not is_read) then
    raise exception 'Other user notification was modified';
  end if;
end
$assert$;
rollback;
