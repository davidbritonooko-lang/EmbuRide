# EmbuRide security and release verification

Last reviewed: 2026-11-08

## Verified database controls

- Row-level security is enabled on all 16 application tables in the public schema.
- The private `driver-documents` storage bucket is configured separately from public application assets.
- The 24 authenticated, public-schema `SECURITY DEFINER` RPCs inspected during this review all call `private.require_active_account()` and have a fixed `search_path`.
- The private active-account helper checks `auth.uid()` and requires the corresponding profile to have `account_status = 'active'`. It is not directly executable by `anon` or `authenticated`.
- None of the 24 authenticated `SECURITY DEFINER` RPCs is executable by `anon`.
- The `get_latest_trip_location(uuid)` RPC is `SECURITY INVOKER`, is executable only by authenticated users, checks for an active account, and relies on the existing participant-only RLS policy for `trip_locations`.
- The trip-location RLS policy permits reads only to the booking's passenger, assigned driver, or an administrator while the booking is in an active status. Completed and cancelled bookings no longer expose their recorded trip locations.

## Outstanding advisor findings

The Supabase Security Advisor still reports 24 warnings because authenticated users can execute public-schema `SECURITY DEFINER` RPCs. These functions are intentionally exposed to support narrowly scoped application workflows, but the warning is not considered resolved merely because anonymous execution is denied.

Before production launch, each RPC must receive a documented authorization review. Where a function can safely operate as `SECURITY INVOKER`, it should be converted; otherwise, its ownership checks, role checks, input validation, fixed search path, and least-privilege grants must be reviewed and tested. Do not blanket-revoke these functions: the current application calls them for booking, fare, driver, trip, and administration workflows.

The Performance Advisor reports 19 unused-index notices. These are informational and do not justify dropping indexes without query-plan and workload evidence. The Health Advisor returned no findings during this review.

## Verification performed

- Existing database workflow smoke tests: booking, driver workflows, admin workflows, account status, RLS, profile/notification, and database workflows.
- Trip-location smoke test: active passenger can read the latest point; an unrelated account cannot; access closes after completion. Test fixtures were rolled back.
- Security ACL smoke test: all 24 authenticated `SECURITY DEFINER` RPCs have the active-account guard, fixed search paths, and no anonymous EXECUTE grant.
- Public UI Playwright checks cover the landing, sign-in, and registration pages at multiple viewport widths. These do not replace authenticated passenger, driver, and admin browser testing.

## Release gates still open

- Complete authenticated browser end-to-end tests for passenger, driver, and administrator journeys.
- Verify real Supabase sign-in, email confirmation, password recovery, document upload, and private document review using controlled test accounts.
- Complete the individual review of all 24 `SECURITY DEFINER` RPCs and decide how to handle the remaining advisor warnings.
- Confirm production environment variables, authentication redirect URLs, domain, and deployment access.
- Complete responsive and live-map checks on real mobile devices and a production-like browser deployment.

No production deployment or merge to `main` is authorized by this review.
