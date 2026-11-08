-- Stage 4.2: permit role resolution to inspect the caller's own admin assignment.
-- The existing admin_profiles_self_or_admin_read RLS policy restricts visible rows.
grant select on public.admin_profiles to authenticated;
