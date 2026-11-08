-- Read-only security checks for authenticated SECURITY DEFINER RPCs.
do $security_review$
declare
  v_function record;
  v_count integer := 0;
begin
  for v_function in
    select
      p.oid,
      p.oid::regprocedure::text as signature,
      coalesce(array_to_string(p.proconfig, ','), '') as settings,
      pg_get_functiondef(p.oid) as definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  loop
    v_count := v_count + 1;
    if has_function_privilege('anon', v_function.oid, 'EXECUTE') then
      raise exception 'Anonymous execution is unexpectedly enabled for %', v_function.signature;
    end if;
    if position('require_active_account' in lower(v_function.definition)) = 0 then
      raise exception 'Active-account guard is missing from %', v_function.signature;
    end if;
    if position('search_path=' in v_function.settings) = 0 then
      raise exception 'Fixed search_path is missing from %', v_function.signature;
    end if;
  end loop;

  if v_count <> 24 then
    raise exception 'Expected 24 authenticated SECURITY DEFINER RPCs, found %', v_count;
  end if;

  if has_function_privilege('anon','private.require_active_account()','EXECUTE')
     or has_function_privilege('authenticated','private.require_active_account()','EXECUTE') then
    raise exception 'The private active-account helper must not be directly executable by API roles';
  end if;

  if has_function_privilege('anon','public.get_latest_trip_location(uuid)','EXECUTE') then
    raise exception 'Anonymous execution of the participant trip-location RPC is enabled';
  end if;
  if has_function_privilege('anon','private.is_driver_presence_fresh(uuid)','EXECUTE') then
    raise exception 'Anonymous execution of the private driver-presence helper is enabled';
  end if;
  if not has_function_privilege('authenticated','private.is_driver_presence_fresh(uuid)','EXECUTE') then
    raise exception 'Authenticated execution of the private RLS helper is missing';
  end if;
end
$security_review$;
