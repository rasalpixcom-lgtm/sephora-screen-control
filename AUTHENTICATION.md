# Login and roles

Accounts are managed by this application. Login IDs use an email format but do not require a real mailbox. No email verification, invitation mail, or external identity service is used.

## First Admin

The first Admin chooses a password through a private, single-use setup URL. Setup expires after 24 hours and cannot create a second first Admin. Local and hosted databases are independent, so each needs its own setup. Do not put setup URLs in source control or share them with staff.

## Everyday use

1. Sign in at `/login`.
2. Admin → Users → Add user. Enter name, login ID, password (12–128 characters), and role.
3. Share the credentials privately with that person. Staff can change their own password at `/account`.
4. Admins can change roles, disable/enable accounts, set replacement passwords, and sign out sessions. The current Admin cannot remove their own Admin access; the server preserves at least one enabled Admin.

| Role | Admin / inventory / users | Controller | Monitor |
| --- | --- | --- | --- |
| Admin | Manage | Control | View |
| Controller | No access | Control | View |
| Wall device | No access | No access | View |

Staff sessions expire after 8 hours; wall device sessions after 30 days. Sign-out, account disable, password reset, and role changes revoke affected sessions. Keep wall credentials dedicated to the wall PC, never an Admin account. All monitors follow the same shared selection.

Passwords are salted scrypt hashes, never plaintext. Session cookies are HttpOnly, SameSite=Lax, and Secure on HTTPS. Public sign-up is disabled. Pages and APIs check the current server session and role; a client-provided role or platform identity header cannot grant access. Writes require the configured origin. Login attempts are rate limited using D1. Account operations are recorded in Activity without passwords.

## Runtime configuration

- `AUTH_SECRET`: unique random secret, at least 32 characters; treat as a secret. Changing it signs out existing sessions.
- `AUTH_URL`: exact canonical origin (local: `http://127.0.0.1:5174`; production: HTTPS).
- `AUTH_ADMIN_EMAIL`: first Admin login ID; mailbox need not exist.
- `AUTH_BOOTSTRAP_HASH`: SHA-256 of a random 32-byte setup token. Treat as a secret.
- `AUTH_BOOTSTRAP_EXPIRES`: setup expiry as Unix milliseconds.
- `DB`: D1 binding with all Drizzle migrations applied.

Local settings are in ignored `.dev.vars`. Hosted settings use Site runtime variables/secrets. Never commit secret values. After setup, remove bootstrap settings from production; the database also prevents reuse. If every Admin loses a password, an authorized server operator must issue recovery through a controlled maintenance procedure; there is deliberately no public Admin recovery endpoint.

## Verification

Run `npm run build`, then `node tests/auth.integration.mjs`. The suite uses a fresh in-memory D1 database in Miniflare and does not alter real accounts or screen inventory.

## Company server deployment

This implementation still runs on Cloudflare Worker + D1. It is not a static-only website and cannot simply be uploaded to a conventional public web folder. A standard Node server deployment needs an appropriate runtime/database migration. Better Auth supports other database adapters, so account logic can be retained while changing the backend.

Before exposing the company deployment, configure HTTPS, canonical origin, trusted proxy IP handling for rate limits, database backups and restore testing, monitoring, and controlled Admin recovery. The current Site remains owner-private behind its existing platform gate; application login does not change that hosting audience. These implementation tests are not a substitute for an independent production security review.
