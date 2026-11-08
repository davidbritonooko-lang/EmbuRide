# EmbuRide release readiness

Last checked: 2026-11-08

## Phase status

| Phase | Scope | Status | Evidence / remaining work |
|---|---|---|---|
| 6 | UI completion and responsive verification | PASS for public pages | Playwright checks cover landing, login, and signup navigation/forms and horizontal overflow at 320, 360, 375, 390, 430, 768, 1024, 1280, and 1440 px. Authenticated workspaces still need browser verification. |
| 7 | Passenger, driver, and admin workflows | PARTIAL | Ten live Supabase SQL smoke/security scripts completed without SQL errors. Real Supabase sign-in, email confirmation, password recovery, private document upload/review, and complete browser journeys remain unverified. |
| 8 | Live trip location | DATABASE PASS; BROWSER PENDING | Foreground driver presence, 30-second presence heartbeat, 15-second trip-location updates, participant map reads, explicit stop, offline handling, and terminal-state access closure are implemented. SQL tests cover participant isolation, stopped/offline behavior, resume, and completion. Real device geolocation and passenger/driver browser synchronization still require preview testing. |
| 9 | Security and reliability | PARTIAL | RLS is enabled on all 16 application tables; driver documents use a private bucket; the 24 public SECURITY DEFINER RPCs have active-account guards, fixed search paths, and no anon EXECUTE grants. Supabase Security Advisor still reports 24 authenticated SECURITY DEFINER warnings requiring formal sign-off. Performance Advisor reports 18 unused-index notices; no indexes were removed. |
| 10 | Vercel preview deployment | BLOCKED | No Vercel project is linked to the EmbuRide repository. The Vercel team requires approval for this connection. A single-use team authorization link was provided to the user; no deployment was created. |
| 11 | Final acceptance | NOT STARTED | Requires a working protected preview, controlled test accounts, real authentication, end-to-end role journeys, and mobile-device verification. |

## Verified automation

The GitHub Actions workflow uses Node.js 22, a committed npm lockfile, and `npm ci`. It runs npm audit at the moderate threshold, TypeScript, ESLint, a production build, Chromium installation, and five Playwright public-page tests.

A prior completed run passed all of those checks, including all five browser tests. The newest branch changes are being revalidated; only the run for the current branch head should be used as final evidence.

## Live database checks

- 21 migrations are recorded by Supabase and the repository now contains the matching original migration versions.
- All 16 application tables have RLS enabled.
- The `driver-documents` storage bucket is private.
- Ten rollback-based database smoke/security scripts completed without SQL errors.
- No temporary `example.invalid` test users remain.
- The Supabase Health Advisor returned no findings.
- Security Advisor warnings and Performance Advisor unused-index notices remain documented in `SECURITY_REVIEW.md`.

## Release restrictions

- The feature branch pull request remains open and is not merged to `main`.
- No production deployment has been created.
- Do not add a Supabase service-role key to Vercel or any `NEXT_PUBLIC_*` variable.
- Do not certify live geolocation, authenticated workflows, or production readiness until they have been tested on a deployed preview.
