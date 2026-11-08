# EmbuRide

Ride discovery and booking for Embu County, Kenya.

## Database

Supabase PostgreSQL migrations are maintained in `supabase/migrations/`.
The database schema uses PostGIS for location-aware matching, Supabase Auth,
row-level security, private driver-document storage, and server-controlled
booking and fare transitions.

The MVP uses simulated payment records only. It does not process real payments
or run background GPS tracking.
