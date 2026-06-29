#!/bin/sh
# Export the shareable reference data (Pokémon, games, encounters, dexes,
# evolutions, …) to db/seed.sql so a fresh `docker compose up` boots with a
# fully-populated database.
#
# PERSONAL DATA IS EXCLUDED: user accounts, caught records, and login sessions
# are dumped as *structure only* (no rows), so the resulting db/seed.sql is safe
# to commit and share.
#
# Run this once, from the repo root, against your running stack:
#
#   sh scripts/export-seed.sh
#
# then commit the regenerated db/seed.sql.
set -e

cd "$(dirname "$0")/.."

# Load .env for the DB name / credentials used by the compose stack.
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

DB="${POSTGRES_DB:-living_pokedex}"
USER="${ADMIN_USERNAME:-postgres}"
OUT="db/seed.sql"

echo "Exporting reference data from database '$DB' (excluding personal tables) …"

# Full dump (schema + data) so a fresh database restores with the original row
# IDs intact — encounters/dex membership reference games & Pokémon by ID, so a
# data-only dump layered on top of a pre-migrated schema would break those FKs.
# --column-inserts emits INSERTs (not COPY) so the app can load it without psql.
# Personal tables are dumped structure-only (--exclude-table-data), so accounts,
# catches, and sessions ship as empty tables — no personal data.
docker compose exec -T db pg_dump \
  -U "$USER" -d "$DB" \
  --column-inserts --no-owner --no-privileges \
  --exclude-table-data=players \
  --exclude-table-data=caught_status \
  --exclude-table-data=session \
  --exclude-table-data=schema_migrations \
  > "$OUT"

echo "Wrote $OUT ($(wc -l < "$OUT") lines)."
echo "Review it, then: git add db/seed.sql && git commit -m 'Update seed data'"
