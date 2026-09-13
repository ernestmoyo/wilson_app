#!/usr/bin/env bash
# Copy the production database from Neon to the DigitalOcean managed Postgres,
# using the Postgres client tools from the official container image, so
# nothing needs installing on the laptop.
#
#   SOURCE_URL='postgres://...neon...'  TARGET_URL='postgres://...ondigitalocean.com.../defaultdb?sslmode=require' \
#   bash scripts/do/copy-db.sh
#
# Forward step: a full logical dump of SOURCE restored into TARGET (which must
# be empty; the app's migrations have NOT been run there yet, the dump carries
# the schema). Rollback: nothing on SOURCE changes; drop and recreate TARGET's
# database to retry. Blast radius: TARGET only.
set -euo pipefail
: "${SOURCE_URL:?SOURCE_URL is required}"
: "${TARGET_URL:?TARGET_URL is required}"
IMG=postgres:16-alpine
DUMP="$(mktemp -t assure-db-XXXX).dump"

echo "dumping source..."
docker run --rm "$IMG" pg_dump --format=custom --no-owner --no-privileges "$SOURCE_URL" > "$DUMP"
ls -la "$DUMP"

echo "restoring into target..."
docker run --rm -i "$IMG" pg_restore --no-owner --no-privileges --dbname "$TARGET_URL" < "$DUMP"

echo "row counts on target:"
docker run --rm "$IMG" psql "$TARGET_URL" -At -c "
  SELECT 'job', count(*) FROM job UNION ALL
  SELECT 'finding', count(*) FROM finding UNION ALL
  SELECT 'evidence', count(*) FROM evidence UNION ALL
  SELECT 'certificate', count(*) FROM certificate UNION ALL
  SELECT 'sync_event', count(*) FROM sync_event UNION ALL
  SELECT 'app_user', count(*) FROM app_user;"
rm -f "$DUMP"
echo "done. The dump file is removed; the copy lives only in the target database."
