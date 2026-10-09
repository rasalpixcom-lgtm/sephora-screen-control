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

Admin creates Admin and Controller accounts in Users. Staff sessions last 8 hours. OnSign uses the private monitor link from Settings without a login. The role retirement migration disables legacy wall accounts and revokes their sessions, preserving account records and history.

## Backups and verification

Use your PostgreSQL installation's `pg_dump` and `pg_restore`; these commands write a binary backup file directly without PowerShell pipe/redirection conversion:

```powershell
pg_dump --host=127.0.0.1 --username=sephora --dbname=sephora --format=custom --file='C:\PrivateBackups\sephora.backup'
pg_restore --host=127.0.0.1 --username=sephora --dbname=sephora_restore_test --no-owner 'C:\PrivateBackups\sephora.backup'
```

Use a protected PostgreSQL password file or enter the password interactively. Restore only into a separate empty database when testing; check accounts and inventory there. Schedule daily backups, keep an off-server copy, and test restoration regularly. Apply database migrations before starting each new app release. Keep the previous build and a database backup for rollback.

`/api/health` returns 200 when the app can reach its database, otherwise 503; it exposes no credentials or inventory. Monitor it and the Windows service logs.

After `npm run build`, run `npm run test:auth` on a development PostgreSQL cluster. The suite creates and drops its own random test database and runs the actual standalone Node server. It does not mutate the real Sephora database. Production HTTPS/IIS and Windows service startup must still be verified on the actual company server; they cannot be verified without its domain and access.

## Private monitor link

For OnSign playback without login, apply the new monitor_access migration before starting this release, then create the private link in Admin → Settings. Paste the complete URL, including its key fragment, into OnSign. Use the configured HTTPS AUTH_URL so the generated URL is reachable by the player. There is one active link; replacement revokes the old link. See AUTHENTICATION.md for key storage, embedding, and player verification.

## Other hosting

The same source works on Linux Node.js servers and hosts that support Node.js plus PostgreSQL. The Dockerfile builds a standalone container without embedding environment secrets. Supply runtime environment variables and a reachable PostgreSQL database, run migrations, and put HTTPS in front. Static-only web hosting is insufficient. The Docker image and Windows IIS/service configuration are supplied deployment options; the local verification uses native Node.js and a PostgreSQL container.

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
