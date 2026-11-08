-- 012: Publish participant-protected booking details for Realtime updates.
alter publication supabase_realtime add table public.fare_offers;
alter publication supabase_realtime add table public.trip_locations;
alter publication supabase_realtime add table public.payment_records;
