# EmbuRide

Ride discovery and booking for Embu County, Kenya.

## Database

Supabase PostgreSQL migrations are maintained in `supabase/migrations/`.
The database schema uses PostGIS for location-aware matching, Supabase Auth,
row-level security, private driver-document storage, and server-controlled
booking and fare transitions.

The MVP uses simulated payment records only. It does not process real payments
or run background GPS tracking.

## Web application

The application uses Next.js App Router, TypeScript, Tailwind CSS, and Supabase Auth.

### Local setup

1. Install Node.js 20 or later.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Set the Supabase project URL and publishable/publishable key in `.env.local`.
5. Start the development server with `npm run dev`.

Never put a Supabase service-role key in a `NEXT_PUBLIC_*` variable or commit it to the repository. The browser and server clients in this stage use only the public publishable key; database access remains governed by RLS.

### Current implementation boundary

Stage 4.1 establishes the Next.js application shell and Supabase client utilities. Authentication screens, profile-backed role resolution, and protected passenger/driver/admin routes are subsequent implementation work. Client-provided metadata must not be treated as authorization.

## Authentication and role routing

- Email/password sign-up and sign-in use Supabase Auth.
- Email confirmation returns through `/auth/callback`.
- `/dashboard` resolves the user's role from protected database records.
- Passenger, driver, and administrator workspaces have server-side role guards.
- Administrator assignments are read under RLS; users cannot assign themselves a role.
- A driver profile remains restricted until its verification status is `verified`.
- The auth middleware refreshes and verifies claims; page authorization independently reads the database role records.

Configure the Supabase Auth site URL and redirect allow-list to include the deployed app origin and the local development origin. Add `/auth/callback` to the allowed redirect URLs. Keep administrator assignment and driver verification as trusted administrative operations.
