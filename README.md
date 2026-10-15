# Sephora Screen Control

Central screen management with three workspaces:
- Admin: countries, regions, locations, screens, groups, accounts, activity, and reports.
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

For supported `https://app.onsign.tv/embed/...` links, cards render OnSign's incoming images directly rather than embedding/cropping its viewer. A 30-second image watchdog automatically reconnects if no successfully decoded images arrive, even if the socket remains open. Heartbeats and capped retry delays handle interruptions; returning to the tab or regaining connectivity also reconnects. The previous minute-based iframe refresh has been removed. After 60 seconds of visible preview time without a decoded image, a burgundy warning with the company character replaces the preview. The warning clears automatically when an image returns. Missing-image progress survives page rotations, pauses off-page, and resets when the monitor reloads. Only the current page's browser previews connect. Unavailable cards show the saved incident duration and start time in GST. Duration uses the API server clock at minute precision, refreshed by the existing three-second state poll, so display-device clock errors do not change it. The monitor header counts all screens in the selected view using the server checker, including other rotation pages. All locations shows per-country counts; country, region, location, group, and individual selections show their own totals. Unchecked or stale previews and unsupported providers are listed separately from previewing and unavailable screens. Missing links are excluded from those status counts and can be managed in Admin. Header data is polled every three seconds; preview detection follows the existing server check schedule. Admin → Countries supports an optional abbreviation (up to 12 characters, unique without regard to casing), such as UAE or KSA. Monitor country badges use it and show the full country name on hover; Admin, Controller, and Reports keep the full name. Leaving the abbreviation empty restores the full-name badge.

Controller → Preview issues lists server observations across the entire inventory, with quick status filters, country/region/location filters, search and up to 20 rows per page. More filters provides other statuses; Details shows exact timestamps in GST. Pagination appears only for multiple pages, and the Controller keeps a stable layout when scrollbars appear. Opening the tab or changing filters does not change the wall. Show issues on wall displays the current filtered failures; Show on wall displays one screen. Recovery removes a screen from the unavailable list on the next successful server check, without automatically changing an existing wall selection.

The Node server checks three OnSign previews at a time, waits up to 30 seconds for a decoded image, and queues each completed check again after 60 seconds. Queues can take longer for large inventories. Missing and unsupported URLs have separate categories; the checker never contacts arbitrary saved URLs. Results older than three minutes become unknown. The Controller's immediate observations start fresh after a restart; report incidents and last successful checks persist in PostgreSQL. The server also needs outbound WSS access to `app.onsign.tv`; server/network problems can affect several previews together. These observations measure image delivery, not whether a physical player is online.

Admin → Reports defaults to all current unresolved preview incidents lasting 20 minutes or more. Separate ranges cover 20 minutes to under 1 hour, 1 to under 2 hours, 2 to under 3 hours, 3 to under 5 hours, 5 to under 10 hours, and 10 hours or more. Lower limits are inclusive and upper limits exclusive: exactly 2 hours belongs only to the 2-to-under-3-hour range and All. Dropdown filters update immediately; literal text search updates after a 300-millisecond pause. Filter changes reset to page one, and Clear filters restores the defaults. Results are ordered longest first with 25 rows per page. The page refreshes every minute and keeps existing rows visible during updates. Download PDF is available once the selected filters finish loading and exports the same range and filters across all pages (up to 5,000 screens), with GST timestamps, continuous serial numbers, the PIXCOM logo and repeated table headings. Checks older than five minutes are marked Verification delayed; periods without server checks are not proof of continuous physical-player downtime.

Apply all migrations, including `0004_preview_incidents.sql` and `0005_country_short_names.sql`, through `npm run db:migrate` before starting this release. Tracking begins with the first failed server check after deployment; earlier history cannot be reconstructed. Successful checks resolve incidents. Replacing/removing a preview link closes its old incident; missing and unsupported links are excluded. Deleted screens remove their incident records. Report APIs and PDF exports require an Admin session and never include private preview URLs or tokens.

This adapter uses the image protocol served by OnSign's public embed viewer, not a guaranteed versioned API. Test it on the actual OnSign player and final hosting domain; provider protocol changes may require an adapter update. The display device needs outbound HTTPS/WSS access to `app.onsign.tv`. Other providers' URLs still use iframes. Receiving images confirms preview freshness, not physical player health; an offline source cannot be repaired by reconnecting.

npm run db:import imports a SQLite file into an empty PostgreSQL database. It does not copy sessions. Never point tests or imports at a production database without reading their requirements.

## Email alerts

Admin → Settings → Email alerts lets Admins choose recipients, the unavailable duration, a grouping window, and optional recovery emails. Alerts start disabled. Defaults are 20 minutes unavailable plus a 5-minute grouping window: the first qualifying preview starts the window, and other qualifying previews join that email. A preview that recovers before sending is excluded. Emails include screen names, locations, durations, and GST timestamps. Missing and unsupported preview links and stale observations do not qualify.

Settings has four tabs: Email alerts, WhatsApp alerts, Monitoring (private monitor link and monitor overview), and Account security. Switching tabs preserves unsaved alert edits; refreshing restores the selected tab but discards unsaved edits. Delivery history initially shows the latest three entries, with an option to expand the latest ten. Failed, unconfirmed and partially accepted deliveries offer expandable details. Tabs support arrow keys, Home and End, and wrap on narrow screens.

**Send current alerts now** in Email alerts sends a manual report using the saved sender and recipients. Save edits first, review the current screen/recipient counts, then confirm Send now. It includes currently confirmed unavailable previews regardless of the alert duration, grouping window or previous automatic notification, and works even when automatic alerts are disabled. Missing/unsupported links, stale or future-dated observations, recovered previews and obsolete sources are excluded. If screens or saved recipients change before sending, review a fresh confirmation. Manual sends have a database-backed one-minute rate limit, appear separately in delivery history, and never alter the automatic incident queue or notification timing. No email is sent for an empty list. Manual emails support up to 500 screens and do not automatically retry; check delivery history/inboxes before retrying an unconfirmed send. Apply `0007_manual_email_alerts.sql` with `npm run db:migrate` before starting this version.

Configure the Gmail sender in the server's private `.env.local`:

```dotenv
ALERT_EMAIL_USER=your-address@gmail.com
ALERT_EMAIL_APP_PASSWORD=your-google-app-password
```

Use a dedicated sender account and a [Google App Password](https://support.google.com/accounts/answer/185833?hl=en). App Passwords require 2-Step Verification and may be unavailable for some account policies. Never commit the password or enter it in the browser. Gmail credentials are read only on the server; recipients are editable in Admin Settings. The server needs outbound access to Gmail SMTP on port 465.

Apply `npm run db:migrate`, rebuild, and restart the server. Save recipients, send a test email, check the inbox/spam folder, then enable alerts. “Sender configured” means credentials are present; an accepted delivery means SMTP accepted the message, which does not guarantee inbox delivery. Recipient addresses use BCC.

The background worker runs while the Node server is running, even when no browser is open. Current qualifying outages are included after enabling alerts. Successful notifications are recorded per incident to avoid repeats; a later separate outage can alert again. Definite delivery failures retry with increasing delays capped at 60 minutes. An interrupted send with an uncertain outcome is recorded as Unconfirmed and is not automatically repeated; check recipients' inboxes before taking further action. Partial acceptance is recorded without resending to everyone. Recent deliveries appear in Settings. Recovery emails are optional and only cover previously notified incidents with fresh successful checks.

## WhatsApp alerts

Admin → Settings → WhatsApp alerts has independent controls for up to 20 individual recipient numbers, the unavailable duration, grouping, optional recovery messages, test PDFs and **Send current alerts now**. Alerts default to disabled with a 20-minute threshold and 5-minute grouping window. Include country codes, such as `+971501234567`; spaces, parentheses and hyphens are normalized. Local numbers and group/chat identifiers are rejected. Only Admins can view or change recipients or send messages.

Configure UltraMsg in the server's private `.env.local`:

```dotenv
ULTRAMSG_INSTANCE_ID="instance8591"
ULTRAMSG_TOKEN="your-private-ultramsg-token"
```

Keep the token on the server; never commit it or enter it in Settings. The instance must be linked/authenticated in UltraMsg using its WhatsApp QR setup, and the server needs outbound HTTPS access to `api.ultramsg.com`. Automatic/manual alerts and tests use [UltraMsg's document endpoint](https://docs.ultramsg.com/api/post/messages/document) with a PDF encoded directly in the POST body and a short caption. Recovery updates use its chat endpoint. No token or private preview URL is included in the message or request URL.

Apply all migrations, including `0007_manual_email_alerts.sql` and `0008_whatsapp_alerts.sql`, rebuild, and restart the Node server. Save your number, press **Send test PDF**, and confirm the attachment opens in WhatsApp before enabling automatic alerts. “API configured” confirms environment values are present, not that the instance is authenticated. “Accepted / queued” means UltraMsg accepted the request; it can queue messages while its instance is disconnected. Delivery receipts are not polled, so actual phone delivery is a separate check. The local automated tests use fake credentials and a loopback provider and do not contact UltraMsg.

The durable worker runs without a browser, checks its queue every 10 seconds, and handles up to three recipient jobs per pass. It batches database queue additions and revalidates saved numbers, preview source and fresh server observations before sending. Each qualifying outage is notified once per recipient. Adding a new number includes current qualifying outages after that number's grouping window; it does not forward an old message. Removed numbers are excluded from pending sends. Re-adding a number with a cancelled, unsent current outage restarts its grouping window; accepted notifications are not repeated. A new outage can notify again. Recovery messages cover only accepted outage notifications with a current successful preview check; an older recovery is excluded after a newer outage starts. Email timing, recipients and delivery queues stay independent.

Test and manual buttons use the saved numbers and have separate persisted one-minute cooldowns. Manual reports work with automatic alerts disabled and bypass the threshold, grouping and prior notification status. Review the current screen/recipient counts before confirming. Changed recipients/screens require a new confirmation, and previews recovered before dispatch are excluded. Empty reports are not queued. Manual reports do not consume the automatic outage queue. Automatic and manual notifications include a short caption and a branded portrait PDF with screen/country totals, longest outage, numbered rows, full locations, durations, GST timestamps, repeated headings and page numbers. PDFs are generated in memory using the existing PDF library and assets; no public download URL is created. Test PDFs contain clearly marked fictional data. Recovery updates remain text and summarize very long lists within the chat limit. Manual PDFs support up to 5,000 screens; larger requests are rejected with guidance to narrow the report. Automatic alerts split larger queues into batches of up to 5,000 screens without dropping remaining entries. Attachments are capped at 7 MB of PDF bytes to stay below UltraMsg's 10,000,000-character base64 limit. Oversized or failed PDF generation is reported as a definite local failure without attempting a provider send or text fallback. Document uploads have a 30-second timeout; uncertain requests retain the existing duplicate-prevention behavior.

Recent history shows the latest three recipient delivery entries, with expansion to ten. Explicit automatic rejections retry only the failed number, with increasing delays capped at 60 minutes. Accepted numbers are not resent. Interrupted or ambiguous requests become **Unconfirmed** and are not automatically repeated; check UltraMsg/WhatsApp before sending again. Manual and test failures are recorded without automatic retries.

## Windows Server and other hosts

See SERVER-DEPLOYMENT.md for Windows/IIS, HTTPS, service startup, database configuration, backups, first setup, and other Node.js hosting options. The old chatgpt.site URL remains a previous Cloudflare-backed publication; this server migration is not deployed there.

## Verification

After npm run build, run npm run test:auth on a development PostgreSQL cluster. It exercises the actual standalone production server in an isolated random database and deletes that test database afterward. The development PostgreSQL role needs CREATE DATABASE for this test only. The production account should not have that privilege.

See CODE-REVIEW.md for the latest review, test results, browser checks and backup restoration results. Run `node tests/preview-health.mjs` for the server checker regression suite. Actual company-server verification of new releases remains a rollout step.

The current development regression commands are:
```powershell
npm run lint
npm run build
node --experimental-strip-types tests/network-origin.mjs
node --experimental-strip-types tests/screens.logic.mjs
node --experimental-strip-types tests/onsign-stream.mjs
node --experimental-strip-types tests/location-filters.mjs
node tests/preview-health.mjs
npm run test:auth
npm run test:activity
npm run test:reports
npm run test:email-alerts
npm run test:whatsapp-alerts
npm run test:whatsapp-pdf
npm run test:import
```
The PDF layout/content suite additionally needs a Python installation with `pypdf` and `pdfplumber`; set `PDF_TEST_PYTHON` to its executable when it is not the default `python`. These are development-only verification tools, not application runtime dependencies.

Run these on the development checkout with its private `.env.local` and a development database role. The server integration suites create and drop disposable databases; they are not company-server startup commands.

The legacy build directory, Sites scripts, D1 schema/migrations, and .openai metadata document the previous deployment and are not part of the active server runtime.
