#!/usr/bin/env bash
set -euo pipefail

: "${DB_URL:?Set DB_URL to the local Supabase database connection string}"

for test_file in supabase/tests/*.sql; do
  echo "Running ${test_file}"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -f "$test_file"
done
