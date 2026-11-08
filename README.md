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

### Current implementation

The application includes email/password authentication flows, database-backed role resolution, protected passenger/driver/admin workspaces, driver onboarding and verification, ride discovery, fare negotiation, booking workflows, and administrator operations. Client-provided metadata is not treated as authorization.

### Maps and location selection

- Passenger route search and driver shared-ride publishing use an interactive Leaflet map with OpenStreetMap tiles.
- Pickup, starting point, and destination can be entered as Embu County place names or selected directly on the map.
- Browser location permission can populate the pickup point; location access is user-initiated.
- Map-selected points are reverse-geocoded with OpenStreetMap Nominatim when available. Coordinates remain usable if a place label cannot be resolved.
- Nearby-driver and shared-ride searches use the selected coordinates through protected Supabase RPCs. Exact driver presence coordinates are not exposed to passengers.
- OpenStreetMap and Nominatim usage is subject to their attribution and fair-use policies.
- Drivers can explicitly start foreground live location sharing for an active booking; updates are rate-limited to at most one write every 15 seconds.
- Location sharing stops when the driver stops it, goes offline, the page becomes hidden, the page closes, or the booking is no longer active. Background GPS tracking is not used.
- Passengers can view the latest driver location on the booking page while the booking is active. The read RPC runs as the caller and is protected by the existing trip-location RLS policy; completed and cancelled bookings no longer expose the location.
- The live trip map uses OpenStreetMap tiles and displays the time of the latest received location update.

## Authentication and role routing

- Email/password sign-up and sign-in use Supabase Auth.
- Email confirmation returns through `/auth/callback`.
- `/dashboard` resolves the user's role from protected database records.
- Passenger, driver, and administrator workspaces have server-side role guards.
- Administrator assignments are read under RLS; users cannot assign themselves a role.
- A driver profile remains restricted until its verification status is `verified`.
- The auth middleware refreshes and verifies claims; page authorization independently reads the database role records.

Configure the Supabase Auth site URL and redirect allow-list to include the deployed app origin and the local development origin. Add `/auth/callback` to the allowed redirect URLs. Keep administrator assignment and driver verification as trusted administrative operations.
