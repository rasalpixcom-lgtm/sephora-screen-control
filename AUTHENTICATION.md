# Login and roles

Accounts are managed by this application. Login IDs use email format but do not require a real mailbox. No email verification, invitation mail, or ChatGPT login is used by the Node server.

## First Admin

For a new, empty database, generate the private setup configuration using scripts/create-bootstrap.mjs, copy its AUTH settings into .env.local, and restart the app. Open the private setup URL and choose a password. The link expires after 24 hours and can create only one first Admin, including during concurrent requests.

The migrated local database already has an Admin; use the existing login ID and password. Do not repeat setup for an imported database.

## Everyday use

1. Sign in at /login.
2. Admin → Users → Add user. Enter name, login ID, password (12–128 characters), and role.
3. Share credentials privately. Users can change their own password at /account.
4. Admin can edit account details, change roles/status, reset passwords, or revoke sessions. Saving account edits signs out the affected user. The server protects the last enabled Admin even across concurrent requests.

| Role | Admin | Controller | Monitor |
| --- | --- | --- | --- |
| Admin | Manage | Control | View |
| Controller | No access | Control | View |
| Wall device | No access | No access | View |

Staff sessions expire after 8 hours; optional wall account sessions after 30 days. Password resets, account edits, account disable, and sign-out revoke sessions. Self password changes require the current password and revoke other sessions. The UI then signs out the current session. OnSign players use the private link described below instead of an interactive account login.

## Private monitor link for OnSign

Admin → Settings → Private monitor link → Create monitor link. Copy the complete URL, including its `#key=…` fragment, into OnSign's Website Link App. Only one link is active. It has no automatic expiry and survives app/player restarts and normal updates. Use HTTPS on the company server.

The URL is shown once. Save it privately in OnSign before leaving Settings. Only a SHA-256 hash of its random 256-bit key is stored in PostgreSQL, so the application cannot retrieve a lost copy. Replace link creates a new key and revokes the previous key atomically; existing walls clear their previews at the next successful poll, normally within three seconds. Disable link revokes it without issuing a replacement. Offline players cannot receive revocation until they reconnect.

The monitor shell opens without a login prompt, but its data requires either the active private key or a signed-in staff session. The key is sent in an Authorization header, not a query string or cookie. It grants only the current wall selection and required location labels, with no user accounts, activity history, inventory editing, or Controller access. Anyone holding the link can view that wall; it is not tied to a hardware ID.

The monitor route permits embedding for OnSign. Admin, Controller, account, and API routes retain framing protection. Test the URL on the actual player/WebView, including its handling of URL fragments and the OnSign image connection. The device must allow outbound WSS to app.onsign.tv. OnSign cards use the existing configured preview token; the private wall key is never sent to OnSign. In IIS/access logging, do not log Authorization headers. If the hosting address changes, update the URL prefix saved in OnSign; the same key remains valid.

## Security and configuration

Passwords use salted asynchronous scrypt hashing with the same format as the previous version. Existing hashes migrate without knowing plaintext passwords. Cookies are HttpOnly, SameSite=Lax, and Secure when AUTH_URL uses HTTPS. Public registration and email recovery endpoints are disabled. APIs check the current database role and account status; client-provided role headers cannot grant access. Mutations require the configured Origin. PostgreSQL stores login rate limits and audit records without passwords.

Set DATABASE_URL, AUTH_SECRET, AUTH_URL, and (for new setup) AUTH_ADMIN_EMAIL, AUTH_BOOTSTRAP_HASH, AUTH_BOOTSTRAP_EXPIRES. See deploy/server.env.example. Changing AUTH_SECRET signs out sessions. Keep actual values in private environment configuration, outside source control and IIS web roots.

TRUST_PROXY defaults to false. Enable it only when the HTTPS proxy replaces incoming X-Forwarded-For with the real client address and direct access to Node is blocked. Otherwise rate limits use a shared bucket. For company-server deployment, verify HTTPS and proxy behavior before rollout.

After first setup, remove bootstrap secrets and private setup files. If all Admins lose their passwords, an authorized server operator must use a controlled maintenance/recovery procedure. There is no public Admin recovery endpoint.

## Verification and deployment

npm run build followed by npm run test:auth runs the production Node server against an isolated PostgreSQL database. Tests cover login, roles, setup, account changes, revocation, and concurrent Admin protection. Tests do not change real users or inventory.

See SERVER-DEPLOYMENT.md for Windows Server, IIS, startup, migration, backups, and restore testing. The previous owner-private Sites publication is separate from this server deployment. Production service/proxy testing and an independent security review remain release steps on the actual company server.
