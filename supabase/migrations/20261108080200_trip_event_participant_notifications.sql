-- 017: Create private participant notifications from auditable trip events.
create or replace function private.notify_trip_event_participants()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare v_passenger_id uuid; v_driver_id uuid; v_title text; v_message text; v_recipient uuid;
begin
  select passenger_id,driver_id into v_passenger_id,v_driver_id
  from public.bookings where id=new.booking_id;
  if v_passenger_id is null or v_driver_id is null then return new; end if;
  v_title := case new.event_type
    when 'booking_requested' then 'New ride request'
    when 'fare_proposed' then 'New fare proposal'
    when 'fare_agreed' then 'Fare agreed'
    when 'booking_confirmed' then 'Booking confirmed'
    when 'booking_cancelled' then 'Booking cancelled'
    when 'booking_rejected' then 'Ride request declined'
    when 'status_driver_arriving' then 'Driver is arriving'
    when 'status_picked_up' then 'Passenger picked up'
    when 'status_in_progress' then 'Trip in progress'
    when 'status_completed' then 'Trip completed'
    else 'Booking update'
  end;
  v_message := left(coalesce(nullif(trim(new.description),''),v_title),500);
  for v_recipient in
    select participant_id from (values (v_passenger_id),(v_driver_id)) participants(participant_id)
    where participant_id is distinct from new.created_by
  loop
    insert into public.notifications(user_id,title,message,is_read)
    values(v_recipient,v_title,v_message,false);
  end loop;
  return new;
end;
$$;
drop trigger if exists trip_event_participant_notifications on public.trip_events;
create trigger trip_event_participant_notifications after insert on public.trip_events
for each row execute function private.notify_trip_event_participants();
revoke all on function private.notify_trip_event_participants() from public, anon, authenticated;
