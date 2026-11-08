create or replace function private.require_active_account()
returns uuid
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not exists (
    select 1
    from public.profiles
    where id = v_user
      and account_status = 'active'
  ) then
    raise exception 'Active account required' using errcode = '42501';
  end if;

  return v_user;
end;
$function$;

revoke all on function private.require_active_account() from public, anon, authenticated;

do $migration$
declare
  v_signature regprocedure;
  v_definition text;
  v_updated text;
begin
  foreach v_signature in array array[
    'public.accept_fare(uuid)'::regprocedure,
    'public.cancel_booking(uuid,text)'::regprocedure,
    'public.confirm_booking(uuid)'::regprocedure,
    'public.create_booking(uuid,public.ride_type,double precision,double precision,double precision,double precision,smallint,uuid)'::regprocedure,
    'public.get_booking_contact(uuid)'::regprocedure,
    'public.propose_fare(uuid,numeric,text)'::regprocedure,
    'public.record_trip_location(uuid,double precision,double precision)'::regprocedure,
    'public.set_driver_presence(double precision,double precision,double precision,double precision,boolean)'::regprocedure,
    'public.update_booking_status(uuid,public.booking_status)'::regprocedure
  ]
  loop
    v_definition := pg_get_functiondef(v_signature);
    v_updated := replace(
      v_definition,
      'v_user uuid := (select auth.uid());',
      'v_user uuid := private.require_active_account();'
    );

    if v_updated = v_definition then
      raise exception 'Active-account guard was not inserted into %', v_signature;
    end if;

    execute v_updated;
  end loop;

  v_signature := 'public.search_nearby_drivers(double precision,double precision,integer,integer)'::regprocedure;
  v_definition := pg_get_functiondef(v_signature);
  v_updated := replace(
    v_definition,
    E'declare\n  v_origin extensions.geography(point, 4326);\nbegin\n  if (select auth.uid()) is null then\n    raise exception ''Authentication required'' using errcode = ''42501'';\n  end if;',
    E'declare\n  v_user uuid := private.require_active_account();\n  v_origin extensions.geography(point, 4326);\nbegin'
  );

  if v_updated = v_definition then
    raise exception 'Active-account guard was not inserted into %', v_signature;
  end if;

  execute v_updated;
end;
$migration$;
