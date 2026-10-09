# Code review and local verification

Reviewed on 8 October 2026.

## Preview recovery verification — 9 October 2026

Investigated a report of card contents occasionally freezing in Chrome. The configured OnSign embed renders JPEG image updates over a WebSocket. Its currently served reconnect code creates a replacement socket without restoring the original arraybuffer binary type; that is a likely stall mechanism, not a reproduction of the user's particular interruption. The cross-origin iframe exposes no supported freshness signal to this application.

Added per-card manual reconnect, eager loading for current-page frames, staggered renewal approximately every five minutes, recovery after the browser comes online, and recovery after returning from a tab hidden for at least 15 seconds. Timers/listeners are disposed when a card leaves the page. Hidden tabs do not perform renewals. These are connection recovery safeguards, not offline-player detection; renewal may briefly clear the preview.

Verification: focused fake-clock tests cover periodic renewal, network events, tab visibility, deduplication, stagger and cleanup, plus strict OnSign URL recognition. ESLint and production build/TypeScript pass. In the browser, a real configured OnSign preview rendered inside an isolated test monitor; manual reconnect replaced the frame and new image updates arrived, with zero captured browser errors. The full isolated PostgreSQL suite passed 149 checks including the browser verification gate, and its temporary credentials/database were removed. The local production server was rebuilt and restarted on port 5174; live inventory, accounts and monitor key were unchanged. Long-duration playback and physical OnSign player testing remain rollout checks.

## Private monitor link verification — 9 October 2026

Added a single active, non-expiring monitor link in Admin Settings, with confirmed replacement and disable actions. Only a SHA-256 hash of the random 256-bit key is stored. Transactions and an advisory lock serialize creation/replacement; generation checks prevent stale controls from replacing or disabling another Admin's new link. Link actions are audited without recording the key. The link is revealed once and stays in component memory only.

The monitor page opens without login. Its separate GET-only endpoint accepts the private key in an Authorization header or an existing staff session, and returns only selected screens and necessary labels. It cannot authorize Admin/Controller APIs. A revoked key cannot fall back to an Admin cookie. The monitor can be embedded; other routes retain X-Frame-Options: DENY. No private key is included in server-rendered markup or page request URLs.

Verification: production build/TypeScript and ESLint pass; 148 server integration checks pass against an isolated PostgreSQL database using the real LAN address and localhost. This includes key creation, concurrent creation/replacement, read-only scope, malformed/unknown keys, CSRF rejection, metadata secrecy, disable/recreate, group/location selection, and restart persistence. Twenty-four origin checks and twelve shared selection checks pass. Browser checks confirmed playback without login, Settings controls in light/dark modes, replacement warning/cancellation, and removal of all iframe previews on the next poll after revocation. Temporary UI credentials and the isolated database were cleaned up after the interrupted browser test.

The new migration adds only the monitor_access table and is applied locally. Existing accounts and inventory were not changed. Physical OnSign player/WebView playback and the company server's HTTPS configuration still require verification there. This feature is not a hardware binding: anyone with the link has view access.

## Scope

Reviewed the active API routes, page access guards, credential/session handling, database queries and transactions, inventory hierarchy, shared wall state, Admin forms, user dialogs, Controller selection flow, Monitor polling/paging, theme handling, migration/import scripts, standalone packaging, and Windows/container deployment configuration. Repository-wide ESLint and the production TypeScript build cover application code and bundled UI components. Legacy Sites/Cloudflare helpers remain inactive reference files.

This is a development review and local verification, not an independent security audit or a claim that every third-party dependency has been manually reviewed line by line.

## Corrections made

1. JSON endpoints reject null/array bodies, incorrect content types, and streamed bodies larger than 64 KiB. Errors return controlled responses instead of uncaught exceptions.
2. Inventory validation, changes, activity records, and returned state run within one PostgreSQL transaction. A shared advisory lock prevents concurrent duplicate names and orphaned children during parent deletion.
3. Creating an item cannot bypass duplicate-name validation by supplying another item's ID. Preview URLs, assignment flags, selection IDs, and rotation intervals have stricter validation.
4. Deleting selected inventory removes obsolete wall filters in the same transaction. Surviving parent filters remain; if the whole selected scope is removed, the wall returns to the remaining broader scope/all locations.
5. User changes and their audit entries commit together. Concurrent duplicate login IDs return a useful validation error. Last-Admin protection remains serialized.
6. Database pool errors on idle connections are handled so interruptions do not crash the process. Pool size is validated, statements have a timeout, and public authentication configuration requires HTTPS. Loopback HTTP remains available locally.
7. Client requests have a 15-second timeout. Polls do not overlap, and an older inventory response cannot overwrite a newly saved mutation. Duplicate saves are guarded.
8. Controller and Monitor share one selection function using indexed lookups. Non-admin polling skips the activity query.
9. Fixed both React lint errors in Controller mode synchronization and theme hydration.
10. Docker packaging includes image assets while continuing to exclude credentials, local databases, runtime setup files, and backups.

## Verification

- Repository-wide `npm run lint`: passed, no errors or warnings.
- Windows production build and TypeScript checking: passed.
- `node --experimental-strip-types tests/screens.logic.mjs`: 12 selection checks passed, including cross-store groups and location/screen intersections.
- Production dependency audit: zero known vulnerabilities in the current lockfile.
- Backup/restore test: all 11 PostgreSQL tables matched after restoration into a disposable database. The live database was read only; the restore database was removed. The private backup remains under ignored `.server-runtime`.
- Environment files, PostgreSQL credentials, and the backup are ignored by Git. No commits for the checked secret/database filename patterns appeared in local history. This is a targeted hygiene check, not comprehensive secret scanning.
- The final expanded server suite passed all 105 checks. Every Admin section and the Controller/Monitor/account routes rendered successfully for Admin. Permission denials, session handling, account changes, hierarchy validation, concurrency, obsolete-filter cleanup, and database connection recovery passed.
- Thirty simultaneous monitor requests with 1,001 screens completed successfully in the isolated local smoke test. This does not measure browser iframe load or sustained company-server capacity.
- Windows and Linux container builds passed; deployment details are in SERVER-DEPLOYMENT.md.

## Remaining checks before company rollout

- Actual Windows Server IIS/HTTPS, proxy-header handling, service account permissions, automatic startup, recovery, and scheduled/off-server backup restoration.
- Browser/device testing of modal interactions, keyboard focus, mobile layouts, fullscreen, and prolonged Monitor playback. Server-rendered route checks do not replace these.
- OnSign embedding and crop behavior on the final domain. Preview URLs still cannot prove physical player health.
- A sustained capacity test on company hardware. The local 1,001-screen/30-request check is a smoke test, not a production benchmark.
- Five high dependency findings remain in the development-only ESLint → fast-glob → micromatch → braces chain. The audit offers a breaking downgrade, which was not applied. Recheck for a compatible upstream fix before releases. Build tools are not publicly served.
- Inventory hierarchy/type rules are enforced through the serialized application API; direct database edits must preserve them. Activity is operational history, not an immutable compliance audit log.

The next step is hands-on testing of the local system, followed by deployment verification on the company server.
