# Sephora Screen Control

Central screen management with three protected workspaces:
- Admin: countries, regions, locations, screens, groups, accounts, and activity.
- Controller: choose the shared wall selection and page rotation.
- Monitor: read-only live-preview cards.

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

npm run db:import imports a SQLite file into an empty PostgreSQL database. It does not copy sessions. Never point tests or imports at a production database without reading their requirements.

## Windows Server and other hosts

See SERVER-DEPLOYMENT.md for Windows/IIS, HTTPS, service startup, database configuration, backups, first setup, and other Node.js hosting options. The old chatgpt.site URL remains a previous Cloudflare-backed publication; this server migration is not deployed there.

## Verification

After npm run build, run npm run test:auth on a development PostgreSQL cluster. It exercises the actual standalone production server in an isolated random database and deletes that test database afterward. The development PostgreSQL role needs CREATE DATABASE for this test only. The production account should not have that privilege.

See CODE-REVIEW.md for the latest review, fixes, 105 integration checks, selection-logic checks, and backup restoration results. Browser/OnSign and actual company-server verification remain rollout steps.

The legacy build directory, Sites scripts, D1 schema/migrations, and .openai metadata document the previous deployment and are not part of the active server runtime.
