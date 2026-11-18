# Windows Server deployment

The app now uses standard Next.js on Node.js and PostgreSQL. Cloudflare Workers, D1, and ChatGPT authentication are not required. The old chatgpt.site publication remains a separate previous deployment.

## Requirements

- Node.js 24 LTS, npm, and PostgreSQL 17 or newer.
- IIS with URL Rewrite and Application Request Routing (ARR), or another HTTPS reverse proxy.
- A dedicated service account and private application directory, outside the IIS web root.
- A domain and valid TLS certificate. Database port 5432 must not be publicly exposed.

## Prepare the database

Create a database and a login owned by the application (use your own password):

```sql
CREATE ROLE sephora LOGIN PASSWORD 'CHOOSE_A_STRONG_PRIVATE_PASSWORD';
CREATE DATABASE sephora OWNER sephora;
```

This role does not need superuser or CREATE DATABASE permissions in production. The isolated integration tests require a separate development role with CREATE DATABASE permission.

## Configure and build

1. Copy the project to a private directory such as `C:\Apps\Sephora`.
2. Copy `deploy/server.env.example` to `.env.local`. Set the database URL, a fresh random AUTH_SECRET, and your HTTPS origin. URL-encode special characters in the database password. Use `DATABASE_SSL=true` with a properly trusted certificate for a remote database.
3. Restrict the source directory, `.env.local`, backups, and logs to the service account and authorized IT administrators. Do not put these files in the IIS web root.
4. In PowerShell, from the project directory:

```powershell
npm ci
npm run db:migrate
npm run build
npm start
```

`npm start` uses the standalone production build and reads `.env.local`. Configure PORT=3000 and HOSTNAME=127.0.0.1 behind IIS. `deploy/windows/start-server.ps1` provides the same startup command for your company's Windows service manager. Configure automatic startup and restart on failure. Keep the service account's filesystem access limited to this application. Do not use the development server for production.

## IIS / HTTPS

Enable ARR proxying and bind the public HTTPS domain. Copy `deploy/windows/web.config` into the IIS proxy site's directory. It forwards requests to `127.0.0.1:3000`; the application files stay outside that directory. Configure HTTP-to-HTTPS redirection in IIS and preserve the public Host header. Set AUTH_URL to that exact HTTPS origin.

For per-client rate limits, configure the proxy to replace incoming X-Forwarded-For with the actual client IP, then set TRUST_PROXY=true. Keep Node bound to loopback so clients cannot bypass the proxy. With TRUST_PROXY=false, login/setup requests share a conservative rate-limit bucket. Never enable trust for arbitrary headers on a directly exposed Node port.

Use HSTS on the HTTPS proxy after the domain and certificates have been verified. Forward request bodies and query strings unchanged. Check the login flow through the public domain before client rollout.

## Existing data

The local SQLite inventory and accounts have already been imported into a separate PostgreSQL database on port 55432. The original SQLite file remains untouched. The import copies inventory, groups, activity, display settings, user accounts, and password hashes. It deliberately does not copy login sessions or rate-limit counters.

For another SQLite/D1 export, first obtain a consistent SQLite database file, migrate an empty PostgreSQL destination, then run:

```powershell
npm run db:import -- 'C:\PrivateBackups\sephora.sqlite'
```

Import refuses a non-empty destination and commits all copied tables together. Legacy monitor accounts are retained as disabled records and their retirement is logged; Admin and Controller credentials remain usable. Never run first Admin setup for an imported database that already has users. For moving this local PostgreSQL data to the company server, use PostgreSQL pg_dump/pg_restore instead.

## First Admin for a new, empty database

```powershell
node scripts/create-bootstrap.mjs admin@company.com https://screens.company.com
```

This writes private configuration and a setup URL under `.server-runtime`. Copy its AUTH settings into `.env.local`, restart the app, open the private URL, and choose your password. The link expires after 24 hours and works once. No real mailbox or email verification is needed. After setup, remove AUTH_BOOTSTRAP_HASH and AUTH_BOOTSTRAP_EXPIRES and delete the private setup files. Do not regenerate AUTH_SECRET casually; it signs out sessions.

Admin creates Admin and Controller accounts in Users. Staff sessions have no application timeout on trusted team computers; sign-out, account changes, password resets and revocation invalidate them. Browser cookie retention can still require signing in again. See AUTHENTICATION.md for the session policy. OnSign uses the private monitor link from Settings without a login. The role retirement migration disables legacy wall accounts and revokes their sessions, preserving account records and history.

## Backups and verification

Use your PostgreSQL installation's `pg_dump` and `pg_restore` with the `postgres`
administrator (or a dedicated backup account with sufficient read and BYPASSRLS
permissions). The application tables enforce row-level security, so the restricted
`sephora` account may fail to produce a complete backup. These commands write a
binary backup file directly without PowerShell pipe/redirection conversion:

```powershell
pg_dump --host=127.0.0.1 --username=postgres --password --dbname=sephora --format=custom --file='C:\PrivateBackups\sephora.backup'
createdb --host=127.0.0.1 --username=postgres --password sephora_restore_test
pg_restore --host=127.0.0.1 --username=postgres --password --dbname=sephora_restore_test --no-owner --exit-on-error 'C:\PrivateBackups\sephora.backup'
```

Use a protected PostgreSQL password file or enter the administrator password
interactively. Do not disable or weaken row-level security to make a backup work,
and do not use `--enable-row-security` for a complete backup: it can omit rows the
backup account cannot see. A failed dump is incomplete; stop and rerun it with the
appropriate account before proceeding. Archive readability alone does not verify
restoration. Restore only into a separate empty database when testing; check
accounts and inventory there. Schedule daily backups, keep an off-server copy,
and test restoration regularly. Apply database migrations before starting each
new app release. Keep the previous build and a database backup for rollback.

Keep private screen and location images in durable folders writable only by the service account and authorized administrators. Set absolute `SCREEN_PHOTO_DIR` and `LOCATION_PHOTO_DIR` paths outside the replaceable application directory. Stop the application while backing up these folders together with PostgreSQL; a database backup alone does not contain photo bytes. Restore both the database and photo folders together.

`/api/health` verifies authentication configuration, database access and required feature tables, including Hardware, Notes, Location photos and Remote access. It returns 503 when these checks fail and exposes no credentials or inventory. Monitor it and the Windows service logs.

After `npm run build`, run `npm run test:auth` on a development PostgreSQL cluster. The suite creates and drops its own random test database and runs the actual standalone Node server. It does not mutate the real Sephora database. Production HTTPS/IIS and Windows service startup must still be verified on the actual company server; they cannot be verified without its domain and access.

## Private monitor link

For OnSign playback without login, apply the new monitor_access migration before starting this release, then create the private link in Admin → Settings. Paste the complete URL, including its key fragment, into OnSign. Use the configured HTTPS AUTH_URL so the generated URL is reachable by the player. There is one active link; replacement revokes the old link. See AUTHENTICATION.md for key storage, embedding, and player verification.

## Other hosting

The same source works on Linux Node.js servers and hosts that support Node.js plus PostgreSQL. The Dockerfile builds a standalone container without embedding environment secrets. Supply runtime environment variables and a reachable PostgreSQL database, run migrations, and put HTTPS in front. Static-only web hosting is insufficient. The Docker image and Windows IIS/service configuration are supplied deployment options; the local verification uses native Node.js and a PostgreSQL container.

For Docker deployments, mount a persistent volume at `/app/uploads` (owned by the container's `node` user), or configure and mount both absolute photo folders. Private uploads are excluded from the build context. Container replacement without persistent storage loses photo files. Back up the volume together with PostgreSQL.

## Verification record — 8 October 2026

- Windows standalone build and TypeScript check pass on Next.js 16.3.8.
- All 105 integration checks pass against an isolated PostgreSQL database, including first Admin concurrency, direct credentials, role restrictions, session revocation, inventory CRUD, shared wall selection, malformed requests, concurrency, and connection recovery. Twelve additional shared selection-logic checks pass.
- Imported inventory and account rows were compared with the original SQLite database. Password hashes were preserved; passwords were not exposed.
- PostgreSQL schema generation succeeds with no pending schema changes.
- `npm audit --omit=dev` reports zero known vulnerabilities with the checked-in lockfile. The full development dependency audit still reports five high findings through the ESLint/fast-glob/micromatch/braces chain. No compatible fix was available in that audit; do not force a framework downgrade. These tools are not part of the standalone server runtime. Recheck advisories before each release and do not expose build or development tools as services.
- The scoped esbuild override patches Drizzle's legacy loader dependency; schema generation and server integration tests verify compatibility.

Local backup restoration was tested against a disposable database, with all 11 tables matching the source. This does not verify the company's scheduled/off-server backup process. Windows and Linux container builds pass. See CODE-REVIEW.md for review scope, corrections, and remaining browser/server checks.

The health endpoint checks authentication configuration and key schema access as well as database connectivity. Public AUTH_URL requires HTTPS. Loopback HTTP works locally; private IPv4 HTTP testing additionally requires ALLOW_LAN_HTTP=true. Keep that flag false for production deployment. See LAN-TESTING.md for the current private-network setup.

This is local verification, not a claim that the company server's HTTPS, IIS proxy, or Windows service recovery has been tested.


## Staged client isolation: migration 0026

Phase 2b originally served only Sephora; migration 0028 below supersedes that limit.
Back up and verify restoration first, stop the app and workers, run migrations
with the existing privileged migration login, build, then restart and check health.
Do not start the new application before migration 0026 succeeds. The migration is
transactional: inconsistent cross-client relationships fail and roll back; do not
delete or reassign existing data to force it through.

The migration creates `pixcom_sephora_runtime` as a non-login role with no
superuser, database/role creation, replication, inheritance or RLS-bypass rights.
It grants only the table operations needed by the existing application. If the
migration login cannot create/grant roles, a DBA must pre-create this role with
those exact attributes and grant it to the migration/application login before
running the migration. Existing unsafe role attributes cause the migration to fail.
In a separate PostgreSQL cluster, provision the role before restoring a backup
that includes its grants/policies; `pg_dump` does not back up cluster roles.

Application and worker connections explicitly switch to the restricted role at
startup, including when DATABASE_URL contains an `options` parameter (that parameter
is reserved for the fixed role). Migration and offline import scripts use their
own privileged connections. For least privilege in deployment, use a dedicated
application login that can SET ROLE to `pixcom_sephora_runtime`, with no table
ownership or RLS-bypass privileges, and a separate privileged migration login.
The application's DATABASE_URL must use the application login in that arrangement;
run migrations in a separate shell with the migration connection. Never expose
migration credentials to users. Existing single-login deployments remain compatible
with the startup role switch, but the login itself retains its administrative powers.

All 22 owned tables enforce the selected client policy; authentication tables
remain global behind application permissions. No company-server change is applied
by local verification. Release and company deployment still require authorization.


## Staged client settings: migration 0027

Phase 2c originally served Sephora only; migration 0028 below enables selection. Back up the database, `.env.local` and all
configured photo folders and verify migration on a restored copy first. Stop all
application and background worker processes before migration/build; restart every
process after the build so no old worker or cached account remains in memory.
Run `npm run db:migrate` with the privileged migration connection before starting
the new application. The current build requires all migrations through 0034. Do not run the old build after applying
the composite settings keys; rollback requires a coordinated code/database plan.

The migration changes keys, not stored values: display selection, alert recipients,
revisions and existing monitor links are preserved. Legacy integration variables
continue to work for Sephora without environment edits. Optional client JSON is
server-only; an explicit client entry replaces every legacy provider for that
client. Omitted providers are disabled, never inherited from another client. Keep
configuration private and do not put credentials in source control or client PDFs.
This configuration does not enable other workspaces. Use `npm run test:client-settings`
on a development PostgreSQL cluster; its database fixtures and transports are isolated.


Client-scoped photos: keep `SCREEN_PHOTO_DIR` and `LOCATION_PHOTO_DIR` pointed at
the same private base folders as before. New uploads use
`clients/client-sephora/<photo-key>.webp` and `<photo-key>-thumb.webp` within each
base. Old flat files stay untouched and remain Sephora-only. No database migration
or manual file move is required for this storage-only step. Do not flatten the
client folders or point the environment settings at a client subfolder. Back up
and restore each entire base directory (legacy files **and** all client folders)
with its matching PostgreSQL backup. The server account requires inherited
write/Modify access for new subfolders; do not grant broad public access. New
client routing is enabled only by the migration 0028 selection stage below.


## Client selection: migration 0028

Back up PostgreSQL, `.env.local` and both complete photo base folders. Verify a
restore and migration on a copy, stop every application/worker process, migrate,
build, then restart and check health before using `/workspaces`. Do not start this
build before migration 0028 succeeds. Existing Sephora values and files are retained;
no company-server migration is performed by local development verification.

The privileged migration login provisions one restricted NOLOGIN runtime role per
active client and grants that role to itself. If using a separate application login,
a DBA must grant each provisioned role to that login as well. Keep migration/DBA
credentials private. Migrations 0029/0030 add bounded Admin client creation. Manual operator
provisioning remains available. Account roles govern all active clients.

`pg_dump` does not include cluster roles. Before restoring into another cluster,
provision the same runtime roles or arrange a DBA-managed restore/provisioning plan.
Restart all processes after configuration changes. Each active client has its own
pool (maximum `DATABASE_POOL_SIZE`, default 10) and preview/alert workers; provision
PostgreSQL connections and external-provider capacity accordingly. Other clients
never inherit Sephora provider credentials. Existing Sephora public monitor links
retain their format; new client monitor links carry a client ID plus a secret in
the URL fragment.


## Shared client access and common monitor: migration 0030

Use the backup, restored-copy verification, stop, migrate, build and restart sequence above. Health requires 0030. Run all migration files in order, including 0029; 0030 supersedes its assignment/platform-role behavior. Existing permission rows remain but are no longer used for access. Existing Sephora records, passwords, settings, monitor hashes and photos are preserved.

Every enabled Admin and Controller can open all active clients from the existing cards page. Admins create clients and manage all accounts; Controllers retain wall-control permissions. No per-client assignments are needed. New clients start empty with disabled alerts and no inherited provider credentials. Use individually named accounts for audit attribution.

The new common monitoring link is optional and independent. Create it from Administration / Clients or Settings / Monitoring, then save the one-time URL privately. Its read-only wall follows the client most recently opened in Controller, with no client dropdown. Run `npm run db:migrate` to apply `0032_common_monitor_display.sql` before restarting; it initializes the common wall to Sephora without altering existing client wall settings or keys. Replacing/disabling it leaves legacy Sephora/per-client links unchanged. Verify both link types after restart, along with Admin/Controller switching and normal Sephora operations.

The owner of the SECURITY DEFINER management function is the privileged migration
login and must retain the provisioning privileges required by migration 0028,
including role creation and access through forced row-security policies. Keep
this login separate from the application login where configured; do not grant
CREATEROLE or direct access to the operator provisioner to runtime roles. The
bounded management function grants a newly provisioned runtime role to the
application connection's session user. Existing roles still need the DBA grants
described above if the application login differs from the migration login.

Run `npm run test:client-management` only on the development PostgreSQL cluster.
It creates disposable databases and UUID-named roles and cleans up its fixtures.
Client renaming, archiving and integration-settings UI are outside this stage.


Client logos (migration `0031_client_logos.sql`) are stored as small validated WebP images in PostgreSQL. The database backup includes them; no new folder or environment variable is required. Run migrations before starting the updated application. Admins manage logos under Administration → Clients → Edit branding. Existing client identity rows, integration settings, inventory and photo folders are preserved.

Client card backgrounds require migration `0033_client_backgrounds.sql`. Apply it before starting this build; health checks reject missing background storage or migration records. Optional logos and backgrounds are managed together through Administration → Clients → Edit branding and are both included in PostgreSQL backups. Client cards show centered logos over full-card backgrounds, with client names as fallbacks. Workspace navigation remains logo-only.


## Dashboard OnSign connections: migration 0034

Apply `0034_client_onsign_settings.sql` before starting this build. It adds an
empty settings table and a bounded Admin-only setter; existing Sephora inventory,
credentials, environment files and monitoring links are not rewritten. Use the
backup/restore rehearsal and privileged migration-account procedure above.

Administration → Clients → OnSign API manages each client's API token and
organization ID. Blank token keeps the effective token; it is never returned to
the browser. Test connection performs read-only provider requests without saving.
Save applies immediately across processes; no restart is required. Disable affects
only that client. Use server settings restores that client's environment fallback,
including the original Sephora configuration. New clients never inherit Sephora's
account. Email/WhatsApp configuration is unaffected.

Dashboard tokens are AES-256-GCM encrypted with a purpose-derived key from the
existing AUTH_SECRET and authenticated to the client ID. Back up the database and
private AUTH_SECRET together. Changing AUTH_SECRET without a credential migration
makes saved tokens unreadable; restore the original secret or replace each token.
Do not put credentials in Git or diagnostic output. The dedicated integration
suite uses disposable databases and a mocked provider (`npm run test:client-onsign`).


The OnSign API editor also supports **Load organizations**. This authenticated,
same-origin Admin operation uses the draft token or the effective saved/server
token, reads paginated organization names/IDs and does not write settings or
audit events. No organization is chosen automatically. Token edits invalidate
the loaded list; an unavailable current ID remains visible rather than silently
switching accounts. Manual ID entry remains available. This addition requires
no migration beyond 0034. Tokens and upstream error details are never returned.
