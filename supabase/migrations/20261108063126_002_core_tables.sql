-- 002: Core relational schema. Private profile attributes remain column-restricted.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (length(trim(full_name)) between 2 and 120),
  email text,
  phone text,
  date_of_birth date,
  avatar_url text,
  account_status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_adult_dob_check check (date_of_birth is null or date_of_birth <= (current_date - interval '18 years')::date)
);

create table public.driver_profiles (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  verification_status public.driver_verification_status not null default 'pending',
  is_available boolean not null default false,
  average_rating numeric(3,2) not null default 0 check (average_rating between 0 and 5),
  completed_trips integer not null default 0 check (completed_trips >= 0),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.driver_profiles(user_id) on delete restrict,
  make text not null,
  model text not null,
  registration_number text not null unique,
  color text,
  seat_capacity smallint not null check (seat_capacity between 1 and 20),
  vehicle_status public.vehicle_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.driver_documents (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.driver_profiles(user_id) on delete restrict,
  document_type public.document_type not null,
  storage_path text not null unique,
  verification_status public.document_verification_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);

create table public.driver_presence (
  driver_id uuid primary key references public.driver_profiles(user_id) on delete restrict,
  current_location extensions.geography(point, 4326),
  destination_location extensions.geography(point, 4326),
  last_seen_at timestamptz,
  is_online boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.ride_offers (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.driver_profiles(user_id) on delete restrict,
  vehicle_id uuid not null references public.vehicles(id) on delete restrict,
  ride_type public.ride_type not null default 'shared' check (ride_type = 'shared'),
  origin extensions.geography(point, 4326) not null,
  destination extensions.geography(point, 4326) not null,
  departure_time timestamptz not null,
  available_seats smallint not null check (available_seats >= 0),
  suggested_fare numeric(12,2) check (suggested_fare is null or suggested_fare >= 0),
  offer_status public.ride_offer_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles(id) on delete restrict,
  driver_id uuid not null references public.driver_profiles(user_id) on delete restrict,
  ride_offer_id uuid references public.ride_offers(id) on delete restrict,
  pickup_location extensions.geography(point, 4326) not null,
  destination_location extensions.geography(point, 4326) not null,
  ride_type public.ride_type not null,
  passenger_count smallint not null default 1 check (passenger_count between 1 and 20),
  agreed_fare numeric(12,2) check (agreed_fare is null or agreed_fare >= 0),
  booking_status public.booking_status not null default 'requested',
  seats_reserved boolean not null default false,
  confirmed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_shared_offer_check check (
    (ride_type = 'private' and ride_offer_id is null and seats_reserved = false)
    or (ride_type = 'shared' and ride_offer_id is not null)
  )
);

create table public.fare_offers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  proposed_by uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12,2) not null check (amount >= 0),
  message text,
  offer_status public.fare_offer_status not null default 'proposed',
  created_at timestamptz not null default now()
);

create unique index fare_offers_one_accepted_per_booking
  on public.fare_offers(booking_id) where offer_status = 'accepted';

create table public.trip_locations (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  driver_id uuid not null references public.driver_profiles(user_id) on delete restrict,
  location extensions.geography(point, 4326) not null,
  recorded_at timestamptz not null default now()
);

create table public.trip_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  event_type text not null check (length(trim(event_type)) between 2 and 80),
  description text,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.cancellations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  cancelled_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (length(trim(reason)) between 3 and 1000),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  reported_user_id uuid not null references public.profiles(id) on delete restrict,
  booking_id uuid references public.bookings(id) on delete restrict,
  category text not null,
  description text not null check (length(trim(description)) between 5 and 3000),
  report_status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.admin_profiles (
  user_id uuid primary key references public.profiles(id) on delete restrict,
  admin_role public.admin_role not null,
  created_at timestamptz not null default now()
);

create table public.payment_records (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  amount numeric(12,2) not null check (amount >= 0),
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'pending',
  reference text unique,
  created_at timestamptz not null default now(),
  constraint payment_records_mvp_simulation_only check (
    payment_method in ('cash', 'mobile_money_simulated', 'card_simulated')
    and payment_status in ('pending', 'paid_simulated', 'failed', 'refunded_simulated')
  )
);

comment on column public.profiles.phone is 'Private contact attribute. Authenticated users receive no column-level SELECT grant; expose only through a confirmed-booking RPC.';
comment on column public.profiles.date_of_birth is 'Private age-verification attribute; not selectable by client roles.';
comment on table public.driver_presence is 'Exact coordinates are never directly selectable by client roles; use the safe nearby-driver RPC.';
comment on table public.payment_records is 'MVP simulation ledger only; no real payment processing.';
