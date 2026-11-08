# EmbuRide deployment checklist

## Runtime

- Use Node.js 22 (also recorded in `.nvmrc`).
- Deploy the Next.js application through Vercel's native Next.js build support.
- Install dependencies with `npm ci`; do not use an unlocked dependency install in release builds.
- Keep production and preview deployments separate.

## Required Vercel environment variables

Set these for the appropriate Preview and Production environments:

- `NEXT_PUBLIC_SITE_URL`: the exact origin for that deployment.
- `NEXT_PUBLIC_SUPABASE_URL`: the Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the Supabase publishable/anon key.

The application does not require a Supabase service-role key in the browser or in the standard Next.js runtime. Never add a service-role key to a `NEXT_PUBLIC_*` variable.

## Supabase Auth configuration

After the Vercel preview URL is known:

1. Set the Supabase Auth Site URL to the intended production origin.
2. Add the production `/auth/callback` URL to the redirect allow list.
3. Add the exact preview callback URL when preview authentication is being tested.
4. Verify email confirmation and password recovery redirect to the correct deployment origin.
5. Keep the local development callback URL for local testing only.

Do not guess the production or preview domain before Vercel creates the deployment.

## Required preview acceptance checks

- Landing, login, signup, forgot-password and password-update pages load.
- Supabase email/password authentication works end to end.
- Passenger, driver and admin role routing is correct.
- Passenger search, booking, fare negotiation and cancellation work.
- Driver availability, presence, verification, ride publishing and trip lifecycle work.
- Live trip location starts only after explicit driver action and stops on offline, page-hidden, page-close, or terminal booking states.
- Private driver documents remain inaccessible to unauthorized accounts.
- Mobile and desktop layouts are verified on the deployed preview.
- Production logs contain no repeated server, auth, map, or realtime errors.

## Release controls

- Do not merge the feature branch into `main` until the preview acceptance checks pass.
- Do not deploy to Production or attach a custom domain without explicit approval.
- Keep simulated payments only; do not configure real payment processing as part of this MVP.
