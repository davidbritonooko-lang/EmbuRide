-- EmbuRide / Stage 3.1
-- 001: PostgreSQL extensions and domain types.
-- PostGIS is installed into Supabase's extensions schema.

create extension if not exists postgis with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.account_status as enum ('active', 'suspended', 'closed');
create type public.driver_verification_status as enum ('pending', 'under_review', 'verified', 'rejected', 'suspended');
create type public.vehicle_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.document_type as enum ('national_id', 'driving_licence', 'vehicle_registration', 'vehicle_insurance', 'profile_photo');
create type public.document_verification_status as enum ('pending', 'approved', 'rejected');
create type public.ride_type as enum ('private', 'shared');
create type public.ride_offer_status as enum ('open', 'full', 'closed', 'cancelled', 'expired');
create type public.booking_status as enum (
  'requested', 'negotiating', 'fare_agreed', 'confirmed',
  'driver_arriving', 'picked_up', 'in_progress',
  'completed', 'rejected', 'cancelled', 'expired'
);
create type public.fare_offer_status as enum ('proposed', 'accepted', 'rejected', 'withdrawn');
create type public.payment_method as enum ('cash', 'mobile_money_simulated', 'card_simulated');
create type public.payment_status as enum ('pending', 'paid_simulated', 'failed', 'refunded_simulated');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type public.admin_role as enum ('super_admin', 'operations_admin', 'verification_admin', 'support_admin');

comment on schema private is 'Non-exposed helper functions and internal implementation details.';
