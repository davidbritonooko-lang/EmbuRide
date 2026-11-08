-- 016: Secure self-service profile reads and updates for private phone data.
create or replace function public.get_own_profile()
returns table(full_name text,phone text,created_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := private.require_active_account();
begin
  return query select p.full_name,p.phone,p.created_at from public.profiles p where p.id=v_user;
end;
$$;
revoke all on function public.get_own_profile() from public, anon;
grant execute on function public.get_own_profile() to authenticated;

create or replace function public.update_own_profile(p_full_name text,p_phone text default null)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_user uuid := private.require_active_account();
begin
  if length(trim(coalesce(p_full_name,''))) not between 2 and 120 then
    raise exception 'Full name must be between 2 and 120 characters' using errcode='22023';
  end if;
  if nullif(trim(coalesce(p_phone,'')),'') is not null and length(trim(p_phone)) not between 7 and 24 then
    raise exception 'Phone number is invalid' using errcode='22023';
  end if;
  update public.profiles set full_name=trim(p_full_name),phone=nullif(trim(coalesce(p_phone,'')),'')
  where id=v_user;
  if not found then raise exception 'Profile not found'; end if;
  insert into public.audit_logs(actor_id,action,entity_type,entity_id)
  values(v_user,'profile.updated','profile',v_user::text);
end;
$$;
revoke all on function public.update_own_profile(text,text) from public, anon;
grant execute on function public.update_own_profile(text,text) to authenticated;
