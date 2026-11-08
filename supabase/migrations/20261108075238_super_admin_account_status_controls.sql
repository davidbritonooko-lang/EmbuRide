-- 014: Super-administrator account suspension and closure controls.
create or replace function public.admin_set_account_status(p_user_id uuid,p_next_status public.account_status,p_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_admin uuid := private.require_active_account(); v_current_status public.account_status;
begin
  if not exists (select 1 from public.admin_profiles where user_id=v_admin and admin_role='super_admin') then
    raise exception 'Super administrator access required' using errcode='42501';
  end if;
  if p_user_id=v_admin then raise exception 'A super administrator cannot change their own account status' using errcode='42501'; end if;
  if p_next_status not in ('active','suspended','closed') then raise exception 'Invalid account status' using errcode='22023'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'A reason is required for account status changes' using errcode='22023'; end if;
  select account_status into v_current_status from public.profiles where id=p_user_id for update;
  if not found then raise exception 'Account not found'; end if;
  if v_current_status='closed' and p_next_status <> 'closed' then
    raise exception 'Closed accounts cannot be reactivated through this operation';
  end if;
  update public.profiles set account_status=p_next_status where id=p_user_id;
  if p_next_status <> 'active' then
    update public.driver_profiles set is_available=false where user_id=p_user_id;
    update public.driver_presence set is_online=false,current_location=null,destination_location=null,last_seen_at=now()
    where driver_id=p_user_id;
  end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id,details)
  values(v_admin,'account.status_changed','profile',p_user_id::text,
    jsonb_build_object('previous_status',v_current_status,'new_status',p_next_status,'reason',left(trim(p_reason),1000)));
end;
$$;
revoke all on function public.admin_set_account_status(uuid,public.account_status,text) from public, anon;
grant execute on function public.admin_set_account_status(uuid,public.account_status,text) to authenticated;
