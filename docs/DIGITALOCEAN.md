# Running Assure Safety Field on DigitalOcean

The platform is one container (API plus web app), one Postgres database and one
object store for photographs. On DigitalOcean that is App Platform, a Managed
Database and a Spaces bucket, all in the Sydney region (closest to New Zealand).
Everything scales by changing a size, not by changing code.

## What runs where

| Piece | DigitalOcean product | Starting size | Grows to |
|---|---|---|---|
| Server and web app | App Platform, one service from the repo `Dockerfile` | 1 vCPU, 1 GB, 1 instance | bigger instances, more instances, autoscaling |
| Records | Managed PostgreSQL 16, daily backups, point-in-time recovery | 1 vCPU, 1 GB, 10 GB | resize in place; add a standby node for high availability |
| Photographs and documents | Spaces bucket `assure-evidence`, private, versioning on | 250 GB included | pay per GB |
| Domain | `field.assuresafety.co.nz` on the app, TLS issued by the platform | | |

Spaces has versioning but not object lock. Evidence is stored under its own
SHA-256 as the key and never overwritten with different bytes, the record in
the database carries the same hash, and versioning keeps every prior version
if anything is ever rewritten. That gives the tamper evidence the IPS wants
without object lock.

Indicative monthly cost at the starting sizes: about USD 5 for the app, 15 for
the database, 5 for Spaces.

## One-time setup (about an hour)

1. **Account.** Create the DigitalOcean account in Assure Safety's name (Bryan
   owns it; Ernest is added as a team member). Turn on two-factor sign-in.
2. **Token.** API, Tokens, Generate New Token, full access, 90 days. This is
   what `doctl` uses. Do not paste it into chat or commit it.
3. **doctl** on the laptop: `winget install DigitalOcean.Doctl`, then
   `doctl auth init` and paste the token when asked.
4. **Spaces.** Spaces, Create bucket: name `assure-evidence`, region Sydney,
   file listing restricted. Then API, Spaces Keys, Generate: keep the key and
   secret for step 6. Enable versioning on the bucket:
   `aws s3api put-bucket-versioning --bucket assure-evidence --versioning-configuration Status=Enabled --endpoint-url https://syd1.digitaloceanspaces.com`
   (any S3 client works; doctl does not do this one).
5. **GitHub.** In DigitalOcean, Apps, Create App, connect the GitHub account
   that owns `wilson_app`, then cancel the wizard. The spec below does the rest.
6. **Create the app and the database from the spec:**
   ```
   doctl apps create --spec .do/app.yaml
   ```
   This creates the managed database too and wires `DATABASE_URL`. Then set
   the secrets in the control panel (Apps, the app, Settings, server,
   Environment Variables): the three passcodes, `SPACES_KEY`, `SPACES_SECRET`.
   Redeploy.
7. **Check it:** `https://<app>.ondigitalocean.app/api/health` must say
   `"db":"pg"` and `"evidence":"spaces"`.
8. **Domain.** Apps, Settings, Domains, add `field.assuresafety.co.nz`, then
   add the CNAME it shows at the DNS host for assuresafety.co.nz. TLS is
   automatic.

## Moving the data from Vercel and Neon

The app's schema is created by its own migrations on first start, so for a
fresh start nothing needs copying: sign in, add people, create jobs. To keep
the demo data and history:

1. Pause the Vercel app (Vercel, project, Settings, pause) so nothing writes
   during the copy.
2. Copy the database with the Postgres tools from Docker (nothing to install):
   ```
   SOURCE_URL='<Neon DATABASE_URL_UNPOOLED>' TARGET_URL='<DigitalOcean connection string>' bash apps/server/scripts/do/copy-db.sh
   ```
   Do this before the app has started against the target database, so the
   dump's schema lands on an empty database.
3. Copy the photographs:
   ```
   cd apps/server && BLOB_READ_WRITE_TOKEN=... SPACES_KEY=... SPACES_SECRET=... SPACES_BUCKET=assure-evidence node scripts/do/copy-evidence.mjs
   ```
   Re-runnable; it skips what is already there.
4. Deploy the app (step 6 above), sign in, open a job with a photograph and
   confirm it loads. Run the live test against the new address:
   ```
   cd apps/mobile && flutter test test/live_server_test.dart --dart-define=LIVE_API=https://field.assuresafety.co.nz --dart-define=LIVE_PASSCODE=...
   ```
5. Rebuild the Android app for the new address and send it to Bryan:
   ```
   flutter build apk --release --split-per-abi --dart-define=API_BASE=https://field.assuresafety.co.nz
   ```
6. Keep Vercel paused for two weeks, then delete the project and the Neon
   database.

## Day to day

- **Deploy:** push to the branch in `.do/app.yaml`; App Platform builds the
  Dockerfile and rolls out with a health check. A failed build never replaces
  the running app.
- **Backups:** the managed database keeps daily backups for 7 days and can be
  restored to any point in that window (Databases, the cluster, Backups). For
  longer retention, a weekly `pg_dump` to a second Spaces bucket is a
  ten-line scheduled job; add it when the records matter beyond the trial.
- **Scale up:** Apps, the app, Settings, server, Edit Plan. Databases, the
  cluster, Settings, Resize. Neither touches the code or the data.
- **Logs and alerts:** Apps, Runtime Logs; set an alert on deploy failure and
  on CPU or memory above 80 percent.
- **Secrets rotation:** change the passcodes from the People screen, not the
  environment; the environment values only seed the first three accounts.

## Local check of the container

```
docker build -t assure-field .
docker run -d --name assure-pg -e POSTGRES_PASSWORD=localtest -p 5433:5432 postgres:16-alpine
docker run --rm -p 8080:8080 -e DATABASE_URL='postgres://postgres:localtest@host.docker.internal:5433/postgres?sslmode=disable'   -e AUTH_REQUIRED=1 -e ASSURE_PASSCODE=test1234 assure-field
curl http://localhost:8080/api/health
```
The image carries no in-memory database (that is a test dependency), so it
needs a real Postgres: the one above is a throwaway container. On
DigitalOcean the managed database fills `DATABASE_URL` automatically.
On this laptop the image build needed `--network=host` for the package
install; the App Platform build does not.
