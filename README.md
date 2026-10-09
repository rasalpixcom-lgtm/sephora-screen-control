# Sephora Screen Control

Central screen management with three workspaces:
- Admin: countries, regions, locations, screens, groups, accounts, and activity.
- Controller: choose the shared wall selection and page rotation.
- Monitor: read-only live-preview cards, using a private OnSign link or staff session.

## Stack

Standard Next.js + React + TypeScript, Node.js 24 LTS, PostgreSQL, Drizzle ORM, and Better Auth. The application does not require Cloudflare Workers, D1, Sites hosting, or ChatGPT sign-in.

## Local use

Configure .env.local using deploy/server.env.example. Install dependencies and apply migrations:

```powershell
npm ci
npm run db:migrate
npm run dev
```

The development URL is http://127.0.0.1:5174. Other projects' ports 5000 and 5173 remain available. The migrated local PostgreSQL database uses port 55432 in the separate sephora-server-postgres Docker container. Its credentials are stored in ignored local files.

The current production-mode LAN test server supports http://localhost:5174 on this PC and http://192.168.2.131:5174 from other devices. See LAN-TESTING.md for the explicit login origins and scoped firewall configuration.

For a production build:
```powershell
npm run build
npm start
```

The build includes a standalone Node server and its static assets. Run db:migrate before starting a new release. Set HOSTNAME and PORT in .env.local; production defaults are documented in deploy/server.env.example.

## Authentication and data

See AUTHENTICATION.md for roles and first Admin setup. The local accounts and inventory have been migrated to PostgreSQL with their existing password hashes. Sign in again with the same credentials. The original SQLite data remains unchanged.

For an OnSign player, create the single private monitor link in Admin → Settings. Paste the full link into OnSign once. It requires no interactive login. Replacing the link revokes its predecessor; only the random key's hash is stored. Apply the new monitor-access database migration before starting this release.

The monitoring wall always uses its dark black-and-green palette, including startup and error screens. It has no appearance menu and ignores previously saved wall appearance preferences. Admin and Controller retain their own light/dark options.

For supported `https://app.onsign.tv/embed/...` links, cards render OnSign's incoming images directly rather than embedding/cropping its viewer. A 30-second image watchdog automatically reconnects if no successfully decoded images arrive, even if the socket remains open. Heartbeats and capped retry delays handle interruptions; returning to the tab or regaining connectivity also reconnects. The previous minute-based iframe refresh has been removed. No clicking is required. The last image remains visible during reconnection with a small status label, which disappears when fresh images arrive. Only the current page's previews connect.

This adapter uses the image protocol served by OnSign's public embed viewer, not a guaranteed versioned API. Test it on the actual OnSign player and final hosting domain; provider protocol changes may require an adapter update. The display device needs outbound HTTPS/WSS access to `app.onsign.tv`. Other providers' URLs still use iframes. Receiving images confirms preview freshness, not physical player health; an offline source cannot be repaired by reconnecting.

npm run db:import imports a SQLite file into an empty PostgreSQL database. It does not copy sessions. Never point tests or imports at a production database without reading their requirements.

## Windows Server and other hosts

See SERVER-DEPLOYMENT.md for Windows/IIS, HTTPS, service startup, database configuration, backups, first setup, and other Node.js hosting options. The old chatgpt.site URL remains a previous Cloudflare-backed publication; this server migration is not deployed there.

## Verification

After npm run build, run npm run test:auth on a development PostgreSQL cluster. It exercises the actual standalone production server in an isolated random database and deletes that test database afterward. The development PostgreSQL role needs CREATE DATABASE for this test only. The production account should not have that privilege.

See CODE-REVIEW.md for the latest review, fixes, 148 integration checks, browser checks, selection-logic checks, and backup restoration results. Physical OnSign playback and actual company-server verification remain rollout steps.

The legacy build directory, Sites scripts, D1 schema/migrations, and .openai metadata document the previous deployment and are not part of the active server runtime.
