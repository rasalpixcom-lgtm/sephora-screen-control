# Code review and local verification

Latest review: 9 October 2026.

## Pre-push review — 9 October 2026

Reviewed application routes, authentication and role enforcement, private monitor access, inventory and activity queries, Admin/Controller/Monitor request handling, migrations, import and backup recovery, standalone packaging, and Windows/container deployment configuration.

Fixed two defects: a stale Users refresh could overwrite a newer account mutation; SQLite import could reject an enabled legacy monitor account under the current retirement constraint. Refresh responses now respect request revisions. Import disables legacy monitor records, preserves credential hashes, and audits retirement within the import transaction.

Verification: 296 checks passed across authentication (157), origin handling (24), screen selection (12), OnSign streaming (31), activity queries/API (62), and SQLite import (10). The import regression covers retained credentials, monitor retirement, omitted sessions, non-empty destination rejection, and transaction rollback. A PostgreSQL backup restored successfully into a disposable database, with all 12 tables matching. Production dependencies have zero reported audit vulnerabilities; development lint dependencies retain five high findings in the documented braces dependency chain. Do not force the suggested framework downgrade.

The user reports successful playback in OnSign, Controller changes appearing on the wall, a fitting 4K layout, and recovery after network interruption. Prolonged unattended operation and company-server HTTPS/IIS/service configuration remain deployment checks. This review does not establish that third-party dependencies or every runtime scenario are defect-free. Private environment files, database fixtures and backups remain excluded from Git.

Final verification after these fixes: repository ESLint and the production build/TypeScript passed. The rebuilt standalone preview restarted on port 5174 and returned HTTP 200 from its health endpoint. Git whitespace checks passed. A focused credential scan of 200 publishable files found only the documented database URL placeholder and a script that generates a private local password; environment files and the review backup are ignored. No commit or push was performed.

## Final monitor density — 9 October 2026

Supersedes the capacity estimates in the balanced-column section below. Tightened the desktop header, caption and footer spacing while preserving 16:9 previews, equal 14px gaps and viewport-based equal columns. Pagination now measures the rendered caption and bottom padding instead of assuming their heights. With a disposable 31-screen fixture, the browser displayed 12 cards in four columns/three rows at 1920x1080 (three pages), and 30 cards in six columns/five rows at 3840x2160 (two pages). Both had visible page controls and document height equal to viewport height, without vertical scrolling. Resizing updated pagination correctly; partial rows remained left aligned. Build/TypeScript and lint passed. Disposable test database/server cleanup completed. Counts assume fullscreen browser space at 100% zoom and can change with display scaling or window size.

## Balanced monitor columns — 9 October 2026

Monitor columns now share available width with a fixed 14px gap. The viewport determines column count independently of the selected screen count, so partial rows stay left aligned and retain the same card size. Pagination uses the actual distributed card width when calculating row height. Build/TypeScript and lint passed. Browser measurements in an isolated five-screen fixture confirmed four equal 455px columns at 1920px width, equal outer margins, a left-aligned fifth card, and six equal approximately 618px columns at 3840px width. With fullscreen height 1080/2160, the revised sizing fits two/five rows respectively (8/30 cards per page). The larger Full HD cards reduce its previous three-row capacity to two rows.

## Image-aware OnSign preview recovery — 9 October 2026

This implementation supersedes both iframe renewal approaches below. In a visible browser diagnostic, the cropped iframe, unchanged embed and direct image connection stopped receiving images for more than two minutes while their connections remained open. This verifies stalled delivery, but does not identify the exact provider or network trigger.

Recognized HTTPS app.onsign.tv/embed URLs now use an isolated client for the image protocol used by OnSign's public viewer. A canvas renders the image itself, without provider headings, page padding or timestamps. Every replacement WebSocket restores arraybuffer handling. Only successfully decoded images reset the 30-second freshness deadline; heartbeat traffic cannot hide a stalled preview. Missing images, decoding failures and network interruptions trigger automatic reconnects with capped retry delays. The last image remains visible with a reconnecting label until a fresh image arrives. Hidden/unmounted previews close their connections and dispose timers; visibility and online events resume delivery. Other providers retain their iframe rendering.

Verification: production build/TypeScript and ESLint passed. Thirty-one focused checks passed, including stale delivery on an open connection, heartbeat handling, replacement binary type, image decoding failure, Blob normalization, healthy delivery without periodic resets, pause/resume, disposal and late-frame cleanup. The real configured feed rendered and visibly changed over several minutes in an isolated browser monitor, with no captured browser errors. Disposable browser fixture servers and databases were cleaned up by their eight-minute expiry; the final targeted browser revocation check did not complete before fixture expiry. Existing revocation integration checks and stream disposal unit checks remain evidence for access cleanup, rather than a newly completed end-to-end revocation check. Live inventory, accounts and monitor keys were unchanged.

The adapter uses the public viewer's protocol, which is not a guaranteed versioned API. Actual OnSign player/WebView compatibility, outbound WSS on the final server network and prolonged unattended playback still need rollout verification. The preview cannot recover an offline source player or a browser that suspends JavaScript. The monitor retains its dark-only palette.

## Unattended monitor refinement — 9 October 2026

The monitor now always uses the dark palette. Removed the dim/soft appearance menu, theme state, stored wall preference lookup, and unused theme CSS. Browser inspection confirmed a dark wall even while the global site preference was light.

For a subsequent report of previews staying frozen while visible, shortened OnSign connection renewal from five minutes to 60–65 seconds with a five-second spread between cards, and removed manual reconnect controls from the view-only wall. This bounds the delay before the next reconnect attempt when the browser is running normally; it is not automatic frame-staleness detection. Existing online/tab-resume recovery and off-page cleanup remain in place. A stalled physical player, provider outage, or a WebView that has suspended JavaScript cannot be repaired by an iframe reconnect.

Verification: production build/TypeScript and repository lint pass; focused recovery tests pass, including an explicit one-minute interval requirement. An isolated PostgreSQL fixture using the real configured OnSign preview stayed visible through two automatic renewal cycles. The iframe connection counter advanced from 0 to 1 to 2 without clicking, fresh image updates arrived after each cycle, and no browser errors were captured. Its temporary server, database and private fixture were removed. No live monitor keys, accounts or inventory were changed. Physical OnSign player and prolonged playback verification remain pending; the shorter renewal can briefly clear a preview every minute.

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

## Activity page refinement — 9 October 2026

- Admin-only history endpoint queries PostgreSQL with 20 records per page, stable newest-first ordering, matching total counts, and an index on timestamp and ID. History is no longer limited to the latest 60 records in the Admin UI.
- Search matches item, action, or actor; action filters and inclusive GST calendar-day filters apply before pagination. Search wildcard characters are treated literally, and invalid dates/pages are rejected.
- The Activity panel includes Apply/Clear, loading/error/empty states, Previous/Next, record ranges, and a GST timezone label. Changing pages returns to the start of the panel; filter changes reset to page one.
- New wall events describe selection and rotation. Existing history is preserved; older unnamed events remain visible in Other actions.
- Verified: production build and TypeScript; lint without warnings; 16 query/description checks; 48 Activity integration checks; 148 existing authentication/server checks. Database tests used disposable local PostgreSQL databases.
- Browser verification: search, Next page, action filters resetting pages, empty results, Clear, GST dates, invalid range disabling Apply, dark/light rendering, and a 390×844 mobile viewport. Final Next navigation was checked visually after rebuilding. Screenshot evidence is kept in ignored `.server-runtime/activity-paged-verified.png` and contains disposable test records.
- Applied the additive Activity index migration to the local database and restarted the local preview on port 5174. Company deployment must also run `npm run db:migrate` before starting the updated server.

## Retire Monitor login role — 9 October 2026

- Only Admin and Controller are available in Add/Edit user forms and accepted by the account API and session policy. Updated Users and Settings explanations; staff sessions remain eight hours.
- Migration `0003_retire_monitor_accounts.sql` preserves legacy wall account records, disables them, deletes their sessions, logs retirement, and adds a constraint preventing enabled wall roles. Retired accounts are excluded from staff management and cannot be re-enabled through that API.
- Applied the migration locally: zero active legacy wall accounts and zero remaining wall sessions. Private monitor access records are unchanged.
- Verification: production build/TypeScript and lint passed; 157 authentication/server checks, 46 Activity server checks, and 16 query/description checks passed. Upgrade tests confirmed old cookies/credentials are blocked, account records remain, and the same private link works without login after retirement. Add/Edit dropdowns were also checked in the browser using disposable accounts.
- Company rollout must apply the migration before starting the updated server. Use the existing private monitor link in OnSign; no replacement is needed for this change.

## Settings refinement — 9 October 2026

- Kept Private monitor link first; combined preview counts and page rotation into a compact Monitor overview with links to Screens and Controller. Removed the repeated login explanation and technical polling interval.
- Account security now opens a password dialog with three stacked fields, Cancel, focus restoration, and disabled controls while saving. The existing account page keeps its inline password form.
- Disable link uses a warning color and retains the explicit confirmation describing when existing monitors stop.
- Verified production build/TypeScript, lint, 16 query checks and 46 Activity integration checks. Browser checks covered dark rendering, stacked password fields, initial focus, Escape/Cancel, the monitor warning and cancel path, and Settings at 390×844. No password change or monitor disable was submitted in the browser.
- Disposable test fixtures were cleaned up; the local server was restored on port 5174 and health returned HTTP 200. Screenshot evidence: ignored `.server-runtime/settings-refined-verified.png`.

## Screens hierarchy selection — 9 October 2026

- Added searchable Country, Region, and Location pickers to Add/Edit screen. Parent changes clear descendants; Edit initializes all three from the saved location. Save remains disabled until a location is chosen, and submission validates its region.
- Added the same cascading filters to the Screens list, combined with the existing search, matching counts, Clear filters, and a filtered empty state. Searchable lists support keyboard selection and scoped alphabetical options.
- Verified production build/TypeScript and lint without warnings. The disposable Activity workflow passed 16 query checks and 46 server checks and seeded a two-country hierarchy for browser verification.
- Browser checks confirmed country and region filtering, scoped location choices, empty results, parent resets, Clear filters, Edit initialization, changing and saving a location, and adding a screen. Add and list layouts were checked at 390×844. All writes were to the disposable test database, which was cleaned up afterward.
- Restored local preview on port 5174; health returned HTTP 200. Evidence: ignored `.server-runtime/screens-filters-verified.png`.

## Plain location dropdowns — 9 October 2026

- Replaced the searchable Country/Region/Location picker with the shared Select control, removing dropdown search fields in both Add/Edit and list filters. Retained cascading resets, alphabetical options, keyboard navigation, and All options for filtering.
- Production build/TypeScript and lint passed. Browser checks confirmed the plain country/region lists, country filtering, Edit initialization, dependent Location reset, Save disabling, and Escape dismissal. The disposable browser workflow completed and cleaned up its database; local preview health returned HTTP 200.
- Screenshot: ignored `.server-runtime/screens-plain-dropdown-verified.png`.

## Admin filter layout stability — 9 October 2026

- Reserved scrollbar space on the Admin document so filtering from a long table to a short table does not change the centered content width. This applies to Admin pages only.
- Production build/TypeScript passed. Verified with a disposable 18-screen fixture: the table remained at left 272px and width 961px before and after filtering to one screen (0px horizontal movement), including opening the Location menu. Test fixtures were cleaned up.
- Restored preview on port 5174; health returned HTTP 200. Screenshot: ignored `.server-runtime/screens-stable-layout-verified.png`.
### Admin dropdown scroll-lock follow-up — 9 October 2026

- Reproduced opening Country on an overflowing Screens list: Radix scroll locking added a 15px body margin despite the root already reserving the scrollbar gutter, shrinking the panel from 961px to 946px.
- Scoped the body scroll-lock compensation override to Admin pages; scrolling remains locked while menus and dialogs are open.
- Browser verified Country, Region, Location, empty filtered results, Add/Edit dialogs, and a dropdown nested inside Add. Panel left stayed 272px and width stayed 961px throughout at a 1280px viewport. Closing dialogs also restored scrolling without shifting the panel.
- Production build and TypeScript passed. The disposable PostgreSQL test run passed 16 query checks and 46 integration checks; fixtures were cleaned up.
### Controller simplification — 9 October 2026

- Removed the decorative workspace label and clock; kept account, sign-out, theme and navigation controls. Phone header keeps controls on one row and navigation beneath.
- Simplified location step headings and screen empty states. Breadcrumb navigation appears after choosing a country. Sample badge now checks the current wall screens only.
- Verified country → region → location navigation, assigned group screens, individual screen selection, restoring all screens, rotation toggle and interval in a disposable PostgreSQL fixture. Live wall selection was not changed.
- Browser checked desktop layout and 390px phone layout: panels stack without horizontal overflow; phone header is 104px tall after cleanup. Production build, TypeScript and targeted ESLint passed. Disposable fixture cleanup completed.
