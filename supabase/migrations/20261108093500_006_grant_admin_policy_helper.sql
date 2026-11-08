-- Fix authenticated RLS policy evaluation: policies invoke this
-- read-only SECURITY DEFINER helper to determine admin membership.
grant execute on function private.is_admin() to authenticated;
