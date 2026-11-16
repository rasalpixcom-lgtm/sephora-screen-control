# Code review and local verification

## Pre-push shared media player review - 4 November 2026

Reviewed the complete pending diff and the maintained application's security/data boundaries: authentication and roles, same-origin writes, bounded request bodies, parameterized database access, inventory relationships and transactions, migration checksums, private photo paths and cleanup, survey selected-field imports, hardware/PPM validation, CMS filtering/finalized reports, PDF routes/assets, OnSign scoping, alert transports and Windows/standalone startup paths. Deep review focused on extending the shared hardware/photo rules to LCD and Video Wall; the existing UI, APIs, text importer and screen PDF renderer all consume those rules. Display-specific sections remain restricted; media player fields and optional photos apply to all three known types. Existing keys and records are preserved, including older surveys without player details. No new blocking application defect was confirmed; no application correction was needed in this review.

Fresh verification passed: all 22 maintained unit/PDF suites; 971 isolated production-server checks (337 auth/inventory, 130 OnSign/photos, 39 survey import, 23 screen details PDF, 54 CMS, 46 Activity, 100 reports, 92 email alerts, 140 WhatsApp alerts, 10 SQLite import); LCD/Video Wall migration preservation and repeatability; read-only local backup and restoration with matching table contents; full lint; production build/TypeScript and standalone packaging. Alert tests used local mock providers; disposable test databases were cleaned up. No company data or real client messaging was involved.

PDF regressions cover all screen types, older LCD records, player section ordering, actual saved player photo inclusion, missing/corrupt photos, long text, page boundaries, fonts and image proportions. Rendered LCD/Video Wall reports were visually reviewed during this change. No new full interactive browser sweep or live company/provider verification was performed in this review. Generated dependencies and inactive legacy D1/Worker code were not audited line by line; their obsolete auth.integration helper is superseded by auth.server. The legacy migration-preservation helper requires a supplied SQLite source; the maintained isolated import suite passed instead.

Configured-secret scans found zero matches in 333 maintained source/text files and 252 packaged application text files. No environment files, uploads or review artifacts are tracked; no environment files are packaged. Standalone server, both Outfit font weights, font license and report logo are present. Fresh npm audit reports zero runtime vulnerabilities; the full tree still has 16 moderate development-only ESLint/minimatch findings, zero high and zero critical. These known tooling findings remain open; no forced dependency downgrade was applied.

This media player change requires no database migration, field-key rename or photo-folder change. No commit, push, production branch update or company-server deployment was performed.


## Pre-push PDF and CMS filter review - 4 November 2026

Reviewed every pending application diff and new export/filter module, and revisited authorization, same-origin writes, bounded inputs, PostgreSQL transactions, inventory relationships, private photo paths, survey imports, alert transports, migrations and standalone packaging. Deep line-level review covered the new screen details PDF route/renderer/download dialog, Outfit assets and licensing, CMS result filters/filtered export/version checks, summary/footer pagination and location portrait containment. Generated dependencies and inactive legacy deployment code were not audited line by line. No new blocking application defect was confirmed and no application correction was needed in this review.

Verification passed: 22 unit/PDF regression suites; 951 isolated server checks (331 authentication/inventory, 124 OnSign/photos, 100 reports, 31 survey import, 54 CMS, 23 screen details PDF, 46 Activity, 92 email alerts, 140 WhatsApp alerts, 10 SQLite import); LCD/Video Wall migration preservation/repeatability checks; guarded local backup/restoration with matching table contents; full ESLint; production build/TypeScript and standalone packaging; and whitespace checks. The legacy migration-preservation helper requires an explicitly supplied SQLite source and was not a runnable standalone suite; the maintained isolated SQLite import suite passed. No company data was changed or real alerts sent.

PDF layout checks cover LED, LCD, Video Wall, unspecified type, missing/corrupt photos, optional location photos, long/unbroken text, margins, page numbering and image proportions. Both Outfit weights are embedded and copied with their license into standalone assets. The user's actual LED/LCD/Video Wall exports were also rendered and reviewed earlier in this review cycle. Existing earlier browser checks cover responsive CMS filters/download controls; a new full interactive browser sweep and live company/provider checks were not performed in this run.

Configured-secret scanning found no matches in 334 maintained text/source files. Environment files and private uploads are excluded from Git and the standalone bundle. Dependency audit remains zero runtime vulnerabilities; the full audit reports 16 moderate development-tool findings in the ESLint/minimatch chain (no high/critical findings). No forced/incompatible dependency downgrade was applied. These known tooling findings remain open.

No migration, dependency version, production branch or company-server change is required by this pending PDF/filter release. Changes remain local and uncommitted; no push or deployment was performed.

## Pre-push hardware, PPM, gallery and survey review - 3 November 2026

Reviewed all pending application changes against f6dcb81, including type-specific hardware visibility, manual LED measurements and diagram proportions, shared location details, PPM validation, private photo categories/storage/cleanup, survey parsing and selected-field imports, authorization, same-origin checks, optimistic concurrency, transaction rollback, schema migrations and standalone routes/assets. Existing authentication, monitor/controller, OnSign, CMS/PDF, Activity, alert and legacy import behavior was regression-tested. Generated dependencies and inactive legacy deployment code were not audited line by line. No new interactive browser sweep or live company/provider validation was performed; the user's manual screen checks complement the automated coverage.

Corrections made during this review:

- Reset the full-photo error when opening a gallery image, so a previous failure cannot incorrectly block another image or a retry.
- Supplied router context to the OnSign content rendering fixture and included the new photo table in the disposable SQLite-import fixture reset.
- Corrected README visibility descriptions: unrelated hardware sections are hidden while saved records are preserved.
- Reinstalled the unchanged lockfile after stopping the local development server's Windows file lock. The fresh build now uses the locked Next.js 16.4.2 rather than the stale installed 16.3.8. No dependency declarations or lockfile versions changed.

Verification passed: lint, production build/TypeScript and standalone packaging; 21 current unit/regression suites including CMS and WhatsApp PDF links, privacy, pagination and text boundaries; 922 isolated server checks (331 authentication/inventory, 124 OnSign/photos, 100 reports, 31 survey import, 48 CMS, 46 Activity, 92 email alerts, 140 WhatsApp alerts, 10 SQLite import); and LCD/Video Wall migration preservation/repeatability checks. Server checks use disposable databases and local mock providers, not company data or real message recipients. Private environments, uploads, generated artifacts and review logs remain ignored by Git.

Security audit: zero production dependency vulnerabilities. The full npm audit reports 16 moderate development-tool findings in the ESLint/minimatch dependency chain, with no high or critical findings. Do not apply the suggested incompatible ESLint/Next lint-config downgrades automatically. These findings remain open.

Release requires a database/photo/environment backup and `npm run db:migrate` before starting the new build (pending migrations 0016–0023). The manual-measurement change itself needs no additional migration. Nothing was committed, pushed or deployed during this review.

## Full pre-push review of search/video changes - 31 October 2026

Revisited maintained application entry points and security/data boundaries: page/API authorization, same-origin validation and bounded bodies, PostgreSQL transactions, migration checksums and backups, inventory relationships/private photo storage paths, hardware/notes/remote access, monitor selection/access, OnSign query scoping and transport recovery, Activity, report generation, alert queues/transports, and standalone packaging. Deep line-level review focused on all pending search/bulk-selection, video URL/player, PDF hyperlink/layout and CSS changes against e23da0b. Generated dependencies and inactive legacy Sites artifacts were not audited line by line; live company-network/provider and full device/browser testing were not repeated.

Confirmed corrections:

- Maximum-length valid PDF fields plus a video hyperlink could place the screen-count summary too close to the footer. Pagination now reserves room for the link and summary and checks summary placement independently. Added tests/cms-pdf.mjs to test:cms and a standalone test:cms-pdf command: maximum fields/unbroken text, legacy no-video records, 70 screen rows, clickable destinations, privacy and body boundaries. Rendered both extreme-field pages and visually verified the correction.
- The backup comparison could produce a false mismatch while preview workers update the development database between pg_dump and SELECT. Backup verification now exports a read-only repeatable-read snapshot and supplies it to pg_dump, then compares against that same snapshot. Restoration into a disposable database passed with all rows in all 26 public tables matching. Company backup/deployment behavior was not changed.

Fresh isolated verification passed: production build/TypeScript; full ESLint; whitespace; all 17 existing unit/regression suites (including 66 CMS and 497 mocked OnSign API checks); the new PDF boundary/link regression; and 721 integration checks (auth/inventory/monitor 213, Activity 46, Reports 89, OnSign/photos 83, email 92, WhatsApp 140, CMS 48, SQLite import 10). CMS tests were rerun after the PDF correction. All 274 application/configuration/script/test files compared matched the tested copy byte for byte. Local mock transports and disposable databases were used; no client alerts were sent.

Configured-secret scans found no matches in 317 source files, 76 browser assets or 174 packaged server artifacts. No environment files were packaged, and the report font is present. Earlier browser checks in this review cycle verified 45-screen search/edit preservation, visible-only bulk changes, media playback/error/removal, desktop/mobile alignment, and complete Remove-button visibility. Video links remain external references and may expire; no video is fetched by the server or made durable by a PDF link.

Outstanding tooling finding: the fresh full npm audit reports 16 moderate affected development-only dependency entries tied to minimatch GHSA-g3hv-75wg-m249 (https://github.com/advisories/GHSA-g3hv-75wg-m249), indexed/updated on 30 October. Locked minimatch 3.1.5 and 10.2.5 are reached through ESLint/TypeScript lint tools. The advisory lists 11.0.1 as patched; current consumers request incompatible older majors. The runtime-only audit reports zero vulnerabilities. npm's forced proposal would downgrade ESLint to 4.0.0; its non-forced dry run still leaves affected older-major minimatch dependencies. No forced downgrade, global major override or dependency-version change was applied. This tooling finding remains open; the full audit is not clean.

No additional blocking application defect was confirmed. No new database migration or photo-folder change is needed. No commit, push, production update or company-server action was performed.

## CMS editable results table width - 31 October 2026

Replaced auto-expanded editor columns with scoped fixed table layout, explicit control/action widths, wrapping screen names and a 1200px scrollable minimum. Reduced cell padding only in the editable results table, removed oversized cell minimums and unnecessary reserved scrollbar gutter. The Remove action column remains pinned at the right while narrower tables scroll; the no-match colspan cell is excluded from sticky positioning. View-mode tables, status values, data, PDF generation and save behavior are unchanged.

Browser fixture verification: the full table fits a 1329px content area; at 390px viewport the complete Remove button is within the scroll container, the page does not overflow horizontally, row removal works and no-match text remains centered/static. The separate media edit inputs use the existing two-column grid and stack on mobile; photo/video top edges are aligned while the player's accessible name and controls remain intact. These are local changes only.

## CMS content video and PDF hyperlink - 31 October 2026

Added an optional HTTP/HTTPS content-video URL to CMS record JSON; older records default to no video and require no migration. Rejects unsafe schemes, embedded login credentials, control characters, malformed URLs and oversized values. The server never fetches video URLs. View mode places a bounded native player beside the image, stacks on narrow screens, uses manual playback/preload none, and provides an Open video link and unavailable-source message. Removing the video URL leaves the image intact. PDFs include a short descriptive clickable label targeting the saved URL, without a third-party shortener or printing the long URL. Existing finalized PDF bytes remain immutable; temporary provider URLs still expire.

Production build/TypeScript, full ESLint, 66 validation/selection checks and 48 isolated CMS server checks passed. Server regressions verify unsafe URLs, URL persistence, older no-video records, clickable PDF destinations and final-report immutability after URL edits. PDF annotations were inspected with pypdf in draft/final/70-screen six-page reports and the draft was rendered and visually inspected. Browser testing on the production fixture saved image/video together, played a generated local WebM to completion with no autoplay/error, verified desktop side-by-side and 390px stacked layout without page overflow, exercised the unavailable-source message, and confirmed clearing video preserves the photo. No real campaign video was accessed. Company server, folders and credentials were unchanged. No commit or push was performed.

## CMS screen-result search - 31 October 2026

Added local search in view and edit modes by screen, location, region or country. Counts show visible/total results; empty matches and Clear search are supported. Search never replaces the full draft or changes PDF/report scope. Changing the query clears bulk selections, and selected IDs are additionally intersected with visible rows before bulk actions. Select all affects matching rows, supports partial selection, and is disabled with no matches. Enter in the search box does not submit the form. Failed saves reveal all rows for correction.

Verification: production build/TypeScript, full ESLint, 51 CMS validation/selection checks and 44 isolated PostgreSQL CMS server checks passed. An isolated browser fixture with 45 mock screens verified view/edit search, 10-of-45 matching selection, hidden rows unaffected by bulk changes, selection clearing, empty state, unsaved remarks surviving filtering, and saving while filtered retaining all 45 screens and edited remarks. The local test database was initially stopped, then recovered and the server suite passed. Company data/server, migrations, PDF generation and other modules were unchanged. No commit or push was performed.

## Database verification completed after Docker recovery - 30 October 2026

Docker's Linux engine and the existing local development PostgreSQL container recovered. Repeated all previously blocked integration suites successfully against disposable databases: authentication/inventory/monitor 213, Activity 46, Reports 89, OnSign/photos 83, email 92, WhatsApp 140, CMS 44 and SQLite import 10 (717 total). External transports were mocked/local; no client messages were sent. A fresh local development backup restored into a disposable database with every row in all 26 public tables matching. All 273 maintained application/configuration/script/test files compared still matched the tested review copy byte for byte.

This resolves the database-verification limitation recorded below. Together with today's successful build/TypeScript, lint, 17 unit/regression suites, zero-vulnerability audit and packaging/secret checks, no blocking issue was confirmed. No application-code change, commit, push or company-server deployment was performed.

## Pre-push recheck - 30 October 2026

Rechecked the pending changes and revisited CMS request parsing, authorization/origin checks, inventory snapshots and group selection, concurrency/finalization, PDF generation, hierarchy counts, private file and standalone paths, migrations and deployment requirements. All 273 maintained application/configuration/script/test files compared in this run matched the isolated review copy byte for byte. No new application defect was confirmed; no application code was changed.

Fresh checks passed: production build/TypeScript, full ESLint, git diff --check and 17 unit/regression suites (client-fetch, hardware, notes, remote access, CMS, Activity queries, mocked OnSign API, OnSign content, photo storage, inventory PDF, WhatsApp PDF, preview health, streams, monitor summaries, screen logic, location filters/counts and network origins). Fresh npm audit reports zero vulnerabilities. Configured-secret scanning found no matches in 316 source files, 76 browser assets and 174 packaged server artifacts. No environment files were packaged; the report font is present.

Fresh database integration runs could not proceed: the local development PostgreSQL endpoint on 127.0.0.1:55432 refused connections and Docker Desktop's Linux engine remained unavailable after a startup attempt. This is an environment limitation, not a passing test result. The 717 integration checks and all-26-table backup restoration last passed on 29 October against these unchanged application files. They were not successfully repeated on 30 October. Company-network/HTTPS and live-provider checks were not repeated. No push, production update or company-server change was performed.

## Follow-up review including country and region location counts - 29 October 2026

Repeated verification after the location-count changes. The isolated clean installation matched all 276 maintained application/configuration/script/test files byte for byte before testing. Production build/TypeScript, full ESLint, git diff --check, all 717 integration checks and the existing unit/regression suites passed. The hierarchy suite now passes 26 checks, including country/region counts, empty locations, moves, deletions and invalid parents. The fresh dependency audit reports zero vulnerabilities.

Additional PDF boundary verification used maximum-length fields and long unbroken text; the two-page output was rendered and inspected without clipping. A fresh local development database backup restored into a disposable database with every row in all 26 public tables matching. Configured-secret scanning found no matches in 316 source files, 76 browser assets or 174 packaged server artifacts. Standalone contains no environment files and includes the report font.

No additional blocking defect was confirmed in this follow-up. No application code changes, commits, pushes, production updates or company-server operations were performed. Existing release requirements and review scope below still apply; live company-network/provider and full device/browser testing were not repeated.

## Full project review with CMS Support - 29 October 2026

Reviewed the maintained application entry points and data flow: page/API authorization and same-origin checks, bounded request parsing, inventory hierarchy and transactions, private screen/location photos and standalone path resolution, screen hardware/notes/remote-access conflicts, monitor access and selection, OnSign organization scoping and preview recovery, activity, report queries/PDFs, email/WhatsApp queues and transports, authentication/session handling, PostgreSQL migrations/import, packaging and deployment paths. The deepest line-level review focused on the pending CMS implementation: server-derived inventory snapshots, group selection/deduplication, manual independent statuses, GST/date validation, optimistic concurrency, private database image storage, PDF layout and immutable finalization. Generated dependencies and inactive legacy Sites/D1 integration artifacts were not audited line by line. This is bounded review evidence, not a guarantee that every possible defect is absent.

Confirmed findings and corrections:

- A fresh npm audit reported runtime findings in locked Nodemailer 10.1.1 and Zod 4.6.5. Updated only those two package versions, to Nodemailer 10.1.4 and Zod 4.6.7, with matching manifest/lockfile. No forced audit fix, framework downgrade or unrelated package-version update. Advisory references: https://github.com/nodemailer/nodemailer/security/advisories/GHSA-8c8m-p3m8-cjg8 and https://github.com/advisories/GHSA-mrhx-c7xc-m3w5. The fresh full audit of the patched clean install reports zero vulnerabilities. The old development-only ESLint entries from earlier review dates are not reported by the current audit database.
- The Reports regression suite still expected 15 migrations. It now compares the applied count with the actual SQL migration files (currently 16), retaining checksum/idempotence checks.
- Import-test cleanup includes CMS tables. The backup/restore verification now discovers every public table rather than relying on a historical fixed list, so CMS records, images and report bytes are covered.

Fresh verification used an isolated clean installation of the patched lockfile and disposable PostgreSQL databases/local mock transports, never the company server:

- Production build/TypeScript, full ESLint and whitespace checks passed.
- 717 integration checks passed: authentication/inventory/monitor 213; Activity 46; Reports/hardware/notes/remote access 89; OnSign/photos 83; email 92; WhatsApp 140; CMS 44; SQLite import 10.
- 497 mocked OnSign API checks, 40 CMS validation/selection checks, 16 Activity query checks, 13 photo storage/upload checks, 25 WhatsApp PDF checks, hardware/notes/remote/fetch/content/inventory-PDF suites and six preview/stream/selection/location/origin regression suites passed. PDF inspection used the bundled Python with pypdf/pdfplumber.
- CMS PDF fixtures cover image/no-image, long fields and 70 screens. All screen rows/statuses remain present; internal notes and per-screen playback-check times stay out of the client PDF. The current 70-screen sample spans six portrait pages with repeated headers and no out-of-margin text. Final-report byte immutability and concurrent-finalize deduplication pass in the server suite.
- Backup of the local development database restored successfully into a disposable database; every row in all 26 public tables matched, including CMS tables and binary columns. The source database was read only by this verification.
- Configured-secret scanning of 316 source files, 76 browser assets and 180 packaged server artifacts found no matches. No .env files were packaged in standalone; the report font is present.

CMS migration 0015 is required for the next release. It has been applied to the local development database only. CMS content images/final PDFs live in PostgreSQL, not an additional filesystem directory. Existing screen/location-photo directories remain persistent and still need their configured Windows account permissions.

The running source-checkout development process and company server were not reinstalled/restarted by this review. The patched lockfile was tested with npm ci in the isolated review copy. Before running the next release, install dependencies, apply migrations, build and restart through the established deployment process. No commit, Git push, production-branch update or company deployment was performed.

## Full project review before pushing — 23 October 2026

Re-reviewed the maintained application paths against `83c24a2`: authenticated pages/API routes, role and origin checks, inventory and gallery transactions, validation and private file paths, screen hardware/Notes/Remote access persistence and conflicts, OnSign organization scoping, client cancellation, preview transport and incident freshness, Controller/Monitor selection, Activity, reports/PDFs, alert queues/transports, migrations/import and standalone/Docker packaging. The only pending application-source change is the HTTP photo-selection correction below. Generated dependencies and inactive legacy Sites/D1 artifacts were not audited line by line; these checks cannot prove the absence of every possible defect.

The new dependency audit flagged the installed Next.js 16.3.8 against newly indexed Next.js advisories: [image optimization](https://github.com/advisories/GHSA-2464-fhr4-w9xw), [Server Action denial of service](https://github.com/advisories/GHSA-p3m5-59mp-jv5r), and [typed-array cache responses](https://github.com/advisories/GHSA-673q-mjm6-r5xr). The advisories were added to the public database on 22 October. Exploitability is conditional: this app has no authored Server Actions or `use cache` functions, and already uses sharp 0.35.5; this finding is not evidence of exploitation. Next.js and its ESLint configuration are now pinned to 16.4.2 in the manifest and lockfile. Only the corresponding Next.js packages changed versions. No forced downgrade or unrelated dependency update was applied.

Fresh verification against the updated dependency set passed:

- Production build and TypeScript, ESLint, whitespace checks, and all six preview/stream/selection/origin/location regression suites.
- Authentication/inventory/monitor access: 213 integration checks; Activity: 16 query and 46 integration checks; Reports and feature persistence/conflicts/cascades/schema health: 89 integration checks plus inventory PDF checks.
- OnSign: 497 mocked API checks, content checks, 13 photo storage/upload checks and 83 server checks. Hardware, Notes, Remote access and fetch-cancellation validation suites passed.
- Email: 92 checks; WhatsApp: 140 checks; PDF layout/content: 25 checks; SQLite import: 10 checks. All sends used mock/local transports and tests used disposable PostgreSQL databases.
- Browser smoke check on the full Next.js 16.4.2 application: sign-in, location editor selection/preview, label/save, page reload and persisted gallery image loading, with no captured browser errors. The separate missing-UUID regression is recorded below. A true company-network/HTTPS browser matrix was not repeated.
- Clean Linux Docker build, non-root runtime, writable private image folders, packaged report font, all 15 migrations and no bundled environment files.
- Configured-secret checks found no matches in 306 source files, 74 browser assets or 173 server artifacts; no packaged environment files were found.

The updated lockfile's runtime audit reports **zero vulnerabilities**. The full audit still reports **five high affected development-only ESLint dependency entries** through the existing braces advisory; that tooling item remains open. Browser clipboard availability on HTTP remains browser-dependent, with the existing manual-copy guidance; the photo fix does not alter authentication, permissions or browser security settings.

No additional application-logic defect was confirmed. No new migration, data import, credential or image-folder change is required. Verification ran in an isolated copy with a separate dependency installation; the source checkout and company PC need `npm ci` and a rebuild/restart to run the updated dependency versions. Existing backup/restore verification from 22 October remains applicable because no schema or storage format changed. Review logs are ignored under `.server-runtime/full-review-20261023`. Following the completed local review, the user authorized committing and pushing to `main`, then updating `production` to the same verified commit. The company PC still requires a separate pull, dependency installation, rebuild and restart.

## Location photo selection on HTTP LAN addresses — 23 October 2026

The location photo editor called the browser's secure-context-only `crypto.randomUUID()` for temporary draft keys. On plain HTTP private-IP addresses, selecting files could throw before updating editor state, leaving no previews. Folder permissions and the server upload route are not involved at that point.

Draft keys now use a React editor ID plus a monotonically increasing local counter. They are only used for draft selection/React keys and are not submitted as storage IDs; server-generated UUIDs, private file paths, validation and upload handling are unchanged.

An isolated browser fixture deliberately removed `crypto.randomUUID` to reproduce this condition. The prior committed component failed with `TypeError: crypto.randomUUID is not a function` and stayed at 0/5. The corrected component displayed five decoded previews with unique IDs and no browser errors. Label editing, reordering, removal/re-addition and the five-photo limit were checked. Production build/TypeScript, ESLint and all 83 isolated OnSign/photo server integration checks passed. The company's browser still needs a post-update check on its actual HTTP address. No database migration or image-folder change is required for this fix.

## Full pre-push review — 22 October 2026

Reviewed the maintained Next.js application and pending work: page/API entry points, authentication and roles, origin/body validation, inventory hierarchy and transactions, screen hardware/Notes/Remote access, private screen/location photos, OnSign query scoping and rendering, preview streaming/checking/incidents, Controller/Monitor selection, Activity, reports/PDFs, alert settings/queues/transports, PostgreSQL schemas/migrations/import, paths, standalone packaging and deployment instructions. Generated dependencies and inactive Sites/D1 artifacts were not audited line by line. This review does not guarantee the absence of every defect.

Confirmed issues corrected:

- `clientFetch` previously replaced callers' cancellation signals with its timeout. It now combines both signals, preserves intentional cancellation and Request signal overrides, and reports actual deadline expiry separately. Additional-detail responses are ignored after their effect is cancelled. New regression checks cover cancellation, pre-aborted signals, Request signals/overrides, timeouts, network failures and successful requests.
- `/api/health` now checks the Hardware and Notes schemas. Regression cases verify unavailable responses for missing Hardware, Notes, Location photos and Remote access tables, followed by recovery after restoration.
- The SQLite import test cleanup now includes the new foreign-key tables. The import, occupied-destination protection and rollback checks pass against the current schema.
- Docker excludes private uploads from its build context and creates a private writable upload directory for its non-root runtime user. Deployment instructions cover persistent photo volumes, coordinated database/photo backups, the location-photo setting and the current persistent-session policy.

Fresh local verification:

| Area | Result |
| --- | --- |
| Native production build, TypeScript, ESLint, whitespace | Passed |
| Clean Linux Docker install/build and non-root storage/assets check | Passed |
| Authentication, authorization, inventory and monitor access | 213 integration checks passed |
| Activity | 16 query and 46 integration checks passed |
| OnSign | 497 mocked API checks, content checks and 83 server checks passed |
| Hardware, Notes, Remote access and fetch cancellation | Validation/regression suites passed |
| Private screen/location photo endpoints | Photo unit suite (13) and authenticated OnSign server scenarios passed |
| Reports, feature persistence, conflicts, cascades and schema health | 89 integration checks plus screen-report/PDF suite passed |
| Email and WhatsApp | 92 email, 140 WhatsApp and 25 PDF checks passed |
| Legacy SQLite import | 10 checks passed |
| Preview health/streaming/summary, selections, locations and origins | All six regression suites passed |
| PostgreSQL backup/restore | All 24 public tables matched in disposable databases, including populated new feature tables |
| Configured-secret checks | No matches in 306 source files, 74 browser assets or 166 server artifacts; no packaged environment files |
| Runtime dependency audit | Zero reported vulnerabilities |

The full dependency audit still reports **five high affected entries in the existing development-only ESLint dependency chain**, through the braces stack-exhaustion advisory GHSA-vfj7-8cjw-p6xm. npm proposes downgrading `eslint-config-next` to 14.2.35; that incompatible downgrade was not applied. This remains an unresolved tooling finding, so the full dependency audit is not clean.

Tests used an isolated source copy, disposable local PostgreSQL databases, mocked OnSign data, loopback SMTP and a local WhatsApp provider. No real alerts were sent. Historical browser checks are recorded below; this review did not repeat a full browser/device matrix. The Linux image was built and its non-root storage/assets checked; actual company-server IIS/HTTPS, service recovery and live provider operation still require release verification. Backup restoration here verifies database rows; actual photo-volume and off-server backup restoration remains an operator check. Apply all migrations through `0014_screen_remote_access.sql` and preserve both private image folders before releasing.

Detailed test/audit logs are ignored under `.server-runtime/full-review-20261022`. No commit, GitHub push or production deployment was performed.

## Pre-push project review — 20 October 2026

Reviewed the pending OnSign and physical-photo changes alongside the active application entry points: authentication and role checks, inventory mutation and transaction paths, private photo storage/serving, fixed OnSign queries and organization scoping, screen details rendering, preview/report/alert routes, PostgreSQL migrations, standalone packaging and configuration. This review covers the maintained application paths, not generated dependencies or inactive legacy connector artifacts; passing checks cannot prove the absence of every defect.

The review found two stale assertions left by recent changes. The OnSign content UI test still expected the progress sentence removed from Content & downloads; it now verifies that progress appears in Overview without repeating in the content panel. The Reports integration test still expected ten migrations after the screen-photo migration raised the total to eleven. Both are corrected. The unused download-summary helper was removed, the README was aligned with the current page, and `npm run test:onsign` now runs its content and photo checks as well as API/server checks.

Fresh verification passed: production build and TypeScript, full ESLint, `git diff --check`, mocked OnSign API (497 checks), OnSign/photo content checks, isolated OnSign server (68), authentication/inventory (213), Activity (46 server plus 16 query), reports (51), email (92), WhatsApp (140 plus 25 PDF), SQLite import (10), and preview/selection/origin/stream unit checks. Server suites used disposable PostgreSQL databases and local mock transports. The PDF checks used the bundled Python runtime. No real alert messages were sent and no live OnSign account queries were repeated in this review.

Current `npm audit --omit=dev` reports zero runtime vulnerabilities. Full `npm audit` still reports five high entries in the development-only ESLint dependency chain through `braces` advisory GHSA-vfj7-8cjw-p6xm; the advisory lists no patched `braces` release. This is an outstanding tooling item, not an application runtime finding. The unrelated untracked `vite.config.ts` remains outside the reviewed feature and must be excluded from any feature commit. Apply migrations 0009/0010 and configure durable private photo storage before a production release. No Git push or production deployment was performed.

## Persistent login and compact monitor header pre-push review — 16 October 2026

Reviewed both pending changes against `84ac0b3` and the main active application paths: authenticated pages and APIs, roles/session creation and validation, cookie renewal and password changes, account/session revocation, same-origin/body validation, inventory/selection transactions, private monitor access, preview incident handling, monitor counts/pagination, reporting/Activity, email/WhatsApp queues and transport, migrations and standalone/Windows startup. No new blocking application issue was identified; no application code correction was required during this review. Generated/vendor code and inactive legacy connector artifacts were not audited line by line. This is a source/regression review, not a guarantee against every possible defect.

Persistent login follows the user's requested policy for trusted team computers: new database sessions use a far-future expiry sentinel, and only still-valid older sessions upgrade on use. Browser cookies renew during authenticated API requests with a 400-day maximum age, HttpOnly, SameSite=Lax, host-only scope and the configured Secure setting. Cookie caching remains disabled. Password changes still require the current password; account edits/disabling, password resets, session revocation and explicit logout invalidate access. Invalid, expired and revoked sessions are not revived. Password-change responses retain ownership of their cookie rotation. Browser cookie eviction/clearing, switching hosts or changing the authentication secret can still require signing in again.

The monitor header changes only visible presentation: colored dots/numbers replace status words, full status descriptions remain in accessible names and native hover titles, full country names remain available on hover, and each country badge stays on one line. Count calculations, screen selection, preview transport and pagination logic are unchanged. Existing browser verification used a disposable fixture: at 1600×1000, seven country badges fit within a 64px header and twelve visible cards formed four columns and three rows. Next-page navigation worked; a 390px viewport had no horizontal overflow or captured browser warnings/errors. All four status labels and loading accessibility were also checked in rendered markup. Layout evidence is ignored under `.server-runtime/compact-monitor-desktop.png` and `.server-runtime/compact-monitor-mobile.png`. More countries, longer labels or other viewport sizes may still require header wrapping and fewer rows.

Fresh verification: **734 automated checks passed** (authentication/inventory/monitor access 200, WhatsApp 140, email 92, Reports/PDF/migrations 51, Activity 62, import 10, preview health 34, stream recovery 54, monitor summary/timing 21, location filters 9, origin policy 24, selection 12, WhatsApp PDF 25). Production build/TypeScript, full ESLint, whitespace and configured-secret checks passed. Server suites used disposable PostgreSQL databases and mock SMTP/WhatsApp providers, including the compiled PDF worker smoke test. Logs are ignored under `.server-runtime/final-session-monitor-*`. No real recipient messages were sent by the agent during this review.

Current audit: **zero runtime vulnerabilities**. The full development audit still lists five affected entries in the ESLint dependency chain through the existing [braces advisory GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). The advisory still lists no patched version; npm proposes an incompatible eslint-config-next downgrade to 14.2.35, which was not applied. This remains an outstanding development-tooling maintenance item.

No database migration, dependency, credentials or unrelated application behavior changed. The unrelated untracked `vite.config.ts` remains untouched and should be excluded from the feature commit. No commit, GitHub push or production deployment was performed. The pending release requires a new build/restart; already-expired staff sessions must sign in once.

## Final pre-push review after live PDF testing — 15 October 2026

Re-reviewed the pending changes against `dc6466f` and the active Next.js application paths: authenticated page/API entry points, roles/sessions/passwords/bootstrap, same-origin and bounded-body validation, inventory and selection transactions, private monitor access, preview transport/incident freshness, reports/export and Activity queries, alert settings and UI state, email and WhatsApp queues, retries/cancellation/restart handling, PDF rendering/transport, migrations, standalone asset/secret packaging and Windows startup. No new application defects were identified in this review, and no application code change was required. Generated/vendor and inactive legacy connector files were not audited line by line; these checks do not prove the absence of every possible defect.

Fresh verification passed: **723 automated checks** (PDF 25, WhatsApp 140, email 92, authentication/inventory/monitor access 189, Reports/PDF/migrations 51, Activity 62, import 10, preview health 34, stream recovery 54, monitor summary/timing 21, location filters 9, origin policy 24, selection 12), production build/TypeScript, ESLint, whitespace and configured-secret checks. Tests used disposable databases, loopback SMTP and a local WhatsApp provider; the compiled background-worker PDF smoke check passed. Detailed logs are ignored under `.server-runtime/full-review-*`. Existing browser/layout checks are recorded below; no browser retest was needed because application code did not change during this review. User has now confirmed real **test, manual and automatic WhatsApp PDF receipt**, closing the document-delivery check noted below. Real recovery delivery remains an optional operator check when enabled.

Dependency audit remains **zero runtime vulnerabilities**, with five high affected development dependency entries through the existing ESLint/braces advisory [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm). Rechecked the advisory: affected braces versions are through 3.0.3 and no patched version is listed. npm proposes an incompatible downgrade of eslint-config-next to 14.2.35, which was not applied. This is an outstanding development-tooling finding, not a completely clean full dependency audit.

Ready for a reviewed feature commit/push on `main`, with the unrelated untracked `vite.config.ts` excluded. Company release remains a separate action requiring migrations 0007/0008, private server UltraMsg configuration, build/restart and deployment health verification. No commit, push or deployment was performed during this review.

## WhatsApp PDF reports — 15 October 2026

Automatic unavailable-preview alerts and manual current reports now send one PDF with a short caption per saved recipient through UltraMsg's document endpoint. Recovery updates retain text delivery. Send test PDF uses clearly fictional sample data. Existing timing, saved-recipient checks, confirmation, cooldown, independent email processing and accepted/uncertain delivery handling remain in place. No additional migration or dependency is needed for this PDF change.

The branded A4 template includes summary counts, longest outage, full screen/location names, unavailable duration, since/last-check timestamps in GST, repeated table headings and numbered continuation pages. Long names wrap without clipping; rows are ordered longest outage first. Generation stays in memory and uses existing packaged PDFKit/font/logo assets, with text/font fallbacks. Reports are capped at 5,000 screens and 7,000,000 PDF bytes to stay below the provider's base64 limit. Oversized manual requests fail before enqueue; automatic groups split at the screen limit without losing the remainder. PDF generation failures are recorded before contacting the provider. Document requests time out after 30 seconds; ambiguous delivery is not automatically repeated.

Verification: **723 automated checks passed** (PDF layout/content 25, WhatsApp 140, email 92, authentication/inventory/monitor access 189, Reports/PDF/migrations 51, Activity 62, import 10, preview health 34, stream recovery 54, monitor summary/timing 21, locations 9, origin policy 24, selection 12). Production build/TypeScript, ESLint, whitespace and configured-secret/package checks passed. The WhatsApp suite also restarted the compiled standalone server with its worker enabled and confirmed valid PDF document requests using packaged assets. All sends used a local mock provider and disposable databases.

Visually inspected rendered sample, long-name and continuation-page PDFs. Browser checks confirmed PDF wording, test/manual queue feedback, confirmation count-change protection, cooldowns, accepted mock deliveries, and a 390px Settings layout without horizontal overflow or captured browser warnings/errors. The fixture completion assertion also passed (141 WhatsApp checks when including that browser-fixture assertion). Evidence and the fictional sample PDF are ignored under `.server-runtime/whatsapp-pdf-settings-desktop.png`, `.server-runtime/whatsapp-pdf-settings-mobile.png`, `.server-runtime/pdf-qa` and `.server-runtime/output/pdf/whatsapp-alert-sample.pdf`. Fixtures were cleaned up.

Real PDF receipt/opening in WhatsApp remains the operator's final check after restarting the local application with this build. Earlier real text delivery does not verify document delivery. No commit, push or company deployment was performed. The existing development dependency advisory recorded below remains unchanged.

## Full project pre-push review — 15 October 2026

Reviewed the pending manual-email and WhatsApp work and the active application paths: page entry points, Admin/Controller/monitor permissions, session and account lifecycle, request/origin validation, inventory hierarchy and selection mutations, private monitor access, preview transport/health and incident persistence, Reports/PDF, Activity, settings forms, alert scheduling/delivery, database access/schema/migrations, standalone packaging and Windows startup. The legacy Sites/connector files and generated/vendor artifacts are outside the active Next.js server paths; the unrelated untracked `vite.config.ts` remains untouched. This review covers source and tested behavior, not every possible provider/network or company-server failure.

Fixed review findings:

- An unsent WhatsApp notification cancelled when a recipient was removed stayed cancelled if the same number was re-added during the current outage. Eligible cancelled outage entries now restart that number's grouping window; accepted and uncertain entries remain untouched. The new regression failed before the correction and passes afterward.
- Delivery cancellation and automatic queue release now share a transaction. An injected PostgreSQL trigger failure verifies both changes roll back together, leaving the job retryable rather than stranded in a scheduled state.
- Email recovery eligibility now excludes an older outage's recovery after a newer outage starts on the same screen. Automatic email qualification also rejects future observation/resolution timestamps. Three new regression checks cover these cases.

No changes to authentication, inventory CRUD, controller selection, monitor playback or Reports behavior were required. A suspected Reports location-scope issue was ruled out in the browser: Location is disabled until Region is selected, and the country/region selections constrain the choices. The temporary internal Reports filter edit was reverted. The browser verified UAE/Dubai choices, changing to Qatar resetting descendants, Doha-only locations, and the WhatsApp Settings tab at desktop and 390px widths with no captured browser warnings/errors or horizontal overflow. Evidence is ignored under `.server-runtime/prepush-reports-location.png`, `.server-runtime/prepush-settings-desktop.png` and `.server-runtime/prepush-settings-mobile.png`; the disposable fixture was cleaned up.

Verification: **688 automated checks passed** (WhatsApp 130, email 92, authentication/inventory/monitor access 189, Reports/PDF/migrations 51, Activity 62, imports 10, preview health 34, stream recovery 54, monitor summary/timing 21, location filters 9, origin policy 24, selection logic 12). Production build/TypeScript, ESLint and whitespace checks pass. Integration suites use isolated PostgreSQL databases, loopback SMTP and a mock WhatsApp provider. User separately confirmed real manual and automatic WhatsApp receipt; the agent sent no real recipient messages during this review. Real recovery receipt remains an operator check.

Dependency audit: **zero runtime vulnerabilities**. The full development audit still reports five affected dependency entries through one existing braces stack-exhaustion advisory in the ESLint toolchain. [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists braces through 3.0.3 as affected and no patched version. npm's suggested remediation downgrades eslint-config-next to 14.2.35; that incompatible framework lint downgrade was not applied. This remains a development-tooling maintenance item rather than a clean full-dependency audit.

Configured secrets were checked against tracked/pending source without printing them. The standalone package excludes environment files; browser bundles exclude provider configuration. Existing private credentials/settings were preserved. No migration SQL was changed during this review. A company release must apply pending migrations 0007 and 0008 before starting the new build. No commit, GitHub push or company deployment was performed.


## UltraMsg WhatsApp preview alerts — 14 October 2026

Added a separate WhatsApp alerts Settings tab with individual international numbers, independent threshold/grouping, optional recoveries, saved-number tests, manual count confirmation, and bounded per-recipient history. Drafts remain mounted across tabs; arrow-key navigation and URL-fragment restoration include the new tab. Source/recipient changes invalidate manual confirmation. The existing Gmail settings, automatic queue and transport are independent.

The transport posts form data to UltraMsg's fixed HTTPS chat endpoint. Instance/token are private server environment values; the token is absent from URLs, snapshots and message text. Response bodies are bounded to 64 KiB, requests time out after 10 seconds, and redirects are rejected. Success is labelled Accepted / queued, which is provider acceptance rather than confirmed phone delivery. Messages show longest outages first with names, locations, durations and GST timestamps. Reports stay below 4,096 characters and explicitly state the number of remaining screens when summarized. No delivery-receipt polling or WhatsApp group sending is included.

Reviewed Admin/session/origin guards, bounded JSON input, phone normalization/duplicates, saved-recipient enforcement, concurrent settings revisions, migration/schema matching, durable jobs, source freshness and source replacement, recipient removal, outage/recovery races, independent email queues, retry delays, uncertain outcomes and restart behavior. The worker batches queue additions, skips completed recovery history, uses one database lock across processes, and handles three recipient jobs per pass. Explicit automatic failures retry only failed recipients; accepted recipients are not resent. Ambiguous/interrupted sends remain Unconfirmed without automatic retries. Manual/test sends have separate persisted one-minute cooldowns and do not automatically retry.

Verification passed: production build/TypeScript, ESLint, whitespace checks and **679 automated checks** (WhatsApp 124, email 89, authentication 189, Reports 51, Activity 62, imports 10, preview health 34, stream recovery 54, monitor summary/timing 21, location filters 9, origin policy 24, selection logic 12). WhatsApp integration uses disposable PostgreSQL databases and a loopback HTTP provider; email uses loopback SMTP. Tests cover grouped timing, partial recipient rejection/retry, recovery eligibility and superseded outages, disabled automation/manual bypass, manual counts/change detection, cancellation, worker concurrency/restart, transport encoding and ambiguous replies, message limits, Admin/Controller/anonymous access, origin rejection, malformed/oversized bodies and health/schema failures. The import fixture cleanup now includes the new queue foreign key.

Browser verification covered the WhatsApp tab, formatted number normalization/save, validation errors, draft retention with send disabling, test and manual queued feedback, confirmation/Cancel, immediate history update, three-entry collapse and expansion, keyboard navigation, refresh persistence and 390px phone layout. No horizontal overflow, duplicate DOM IDs or captured browser warnings/errors were observed. Screenshots are ignored under `.server-runtime/whatsapp-settings-desktop.png`, `.server-runtime/whatsapp-settings-mobile.png` and `.server-runtime/whatsapp-confirmation-mobile.png`. Browser fixtures were cleaned up. Final UI wording additionally identifies WhatsApp in the Settings subtitle and uses sentence-case delivery labels.

Applied additive `0008_whatsapp_alerts.sql` only to the separate local development database. Running migrations twice preserves existing inventory, accounts, selection, monitor access and email settings; WhatsApp defaults disabled. Company rollout must apply both pending migrations 0007 and 0008, configure its private UltraMsg token, rebuild and restart. Real UltraMsg acceptance and delivery to the user's phone remain an operator setup/test step; no real WhatsApp message was sent by the agent. No GitHub push or company deployment was performed. Existing untracked `vite.config.ts` remains unrelated and untouched.


## Manual current-alert email — 14 October 2026

Added Send current alerts now to Email alerts with a count confirmation and a separate Admin-only preview/send API. It uses saved Gmail credentials and recipients, ignores automatic threshold/grouping and previous notification status, and selects fresh unresolved incidents with matching supported sources. Recovered, missing, unsupported, stale and future-dated observations are excluded. A confirmation hash covers the settings revision and current incident IDs; changes require fresh confirmation. The existing database advisory lock and a persisted one-minute limit protect concurrent/repeated sends. Manual reports use the existing branded template with distinct subject and history labels and do not write to the automatic incident queue. Empty lists cannot be sent; lists above 500 screens are rejected without truncation. Failed manual reports stay in history and do not automatically retry.

Added additive migration `0007_manual_email_alerts.sql` to permit the manual delivery kind; applied it locally. Health detects a missing migration, and schema/migration and idempotency checks pass. Company deployment must migrate before starting this build. Reviewed permission/origin guards, bounded JSON input, saved-recipient enforcement, confirmation races, source freshness, mail/privacy handling and automatic-alert independence.

Verification passed: production build/TypeScript, ESLint, whitespace checks and **555 automated checks** (alerts 89, authentication 189, Reports 51, Activity 62, imports 10, preview health 34, stream recovery 54, monitor summary/timing 21, location filters 9, origin policy 24, selection logic 12). SMTP checks use a loopback receiver with fake credentials. Browser verification covered confirmation counts, Cancel, disabled sending for unsaved edits, successful send feedback, immediate manual history refresh, desktop and 390px dialog layout, and no captured warnings/errors. Evidence is ignored under `.server-runtime/manual-alert-confirmation-desktop.png`. No real recipient email was sent by the agent, and this addition has not been committed, pushed or deployed to the company server.

## Pre-push project review — 14 October 2026

Reviewed the pending email-alert and Settings changes, active application entry points, authentication/authorization and same-origin policy, state mutation and selection paths, monitor access and preview checks, incident persistence, Reports/PDF and Activity queries, input/error handling, SQL parameters, migrations, worker startup, packaging and Windows startup. Legacy Sites/Vite artifacts are outside the active Next.js server; the existing untracked `vite.config.ts` remains untouched and is excluded from the planned feature commit. This is a source and regression review, not a guarantee that every possible environment or provider failure has been exercised.

Fixed a confirmed recovery-alert edge case: saving settings after a recovery qualified could move the settings timestamp past its resolution time and leave that pending notification permanently ineligible. Existing recovery queue records now remain eligible while recovery emails are enabled, the same preview source is configured, and its latest observation is fresh and available. A regression check confirms the queued recovery sends with the latest recipients after settings change. Also cleared an obsolete initial-load error after a subsequent successful Settings load.

Final verification passed: production build/TypeScript, ESLint, whitespace checks and **534 automated checks** (alerts 68, authentication/server 189, Reports 51, Activity 62, imports 10, preview health 34, stream recovery 54, monitor summary/timing 21, location filters 9, origin policy 24, selection logic 12). Server suites use disposable databases and loopback SMTP; no real recipient messages were sent by the agent. Earlier browser checks verified Settings navigation, draft retention/save, history limits, keyboard navigation, refresh persistence and 390px layout. User screenshots confirm the final desktop Settings tabs and real Gmail test/grouped-outage delivery; the revised test email header is confirmed in Gmail.

Runtime dependency audit: zero vulnerabilities. Full audit still reports five high advisories in the existing development ESLint dependency chain (`eslint-config-next`, `@next/eslint-plugin-next`, `fast-glob`, `micromatch`, `braces`). Its proposed automatic fix downgrades Next's lint configuration to 14.2.35 and was not applied to this Next 16 project. These remain a development-tooling maintenance item.

Confirmed the standalone package includes nodemailer, the report/mail logo and PDF font, and no `.env` files. A local secret comparison against tracked and pending source found no configured auth secret, database URL or Gmail App Password; private environment and runtime fixtures are ignored by Git. Company deployment must apply migration `0006_email_alerts.sql` and configure Gmail on that server. Subsequent user screenshots confirmed the revised outage email in Gmail desktop and mobile, including the stacked mobile rows and all timestamps. The logo's black tagline has low contrast in Gmail mobile dark mode; the main email content remains readable. Optional recovery inbox delivery remains a manual check. No commit, GitHub push or company release was performed during this review.

## Settings organization — 14 October 2026

Organized Settings into Email alerts, Monitoring and Account security tabs. Monitoring contains the existing private monitor link and overview. Panels remain mounted while hidden to preserve unsaved email edits, and a validated URL fragment restores the selected tab on refresh. ARIA tab relationships, roving focus and Left/Right/Home/End navigation support keyboard access. Tab styling uses the existing workspace theme and wraps on narrow screens. Email history initially renders three entries; expansion shows at most ten. Failure, uncertain and partial details are collapsed by default. Delivery settings, sender credentials and mail processing are unchanged.

Verified production build/TypeScript, ESLint and the 67-check alert integration suite. Browser checks confirmed each panel, unsaved timing retention and successful save after switching, history expansion from three to ten and collapse, keyboard navigation, selected-tab persistence after refresh, Account security access on mobile, a 390px layout without horizontal overflow and no captured browser warnings/errors. Screenshots are saved in ignored `.server-runtime/settings-tabs-desktop.png`. Fixtures use an isolated database and fake sender credentials; no external test emails were sent. No GitHub push or company deployment was performed.

## Email template refinement — 14 October 2026

Revised outage, recovery and test emails with a restrained branded header, inline PIXCOM logo, screen counts, longest-outage-first ordering, bold screen names with locations underneath, highlighted durations, one GST timezone note, labeled timestamps and a small explanatory footer. A three-column desktop table stacks into screen blocks below 480px. Plain text messages retain the same order and labeled details. Entity text is HTML-escaped; the original logo is attached as bytes with a CID and falls back to text branding if unavailable. The logo asset is unchanged and requires no external image request.

The alert integration suite passes 67 checks, including ordering, escaping, singular headings, recovery styling/timestamps, logo fallback and the actual inline MIME attachment. Production build, TypeScript and ESLint passed. Local browser preview verification was blocked by a browser navigation error, so visual confirmation of this revised template in Gmail desktop/mobile remains a manual check. Earlier user screenshots confirmed both test and grouped outage delivery for the prior template. Alert settings, queue timing and recipient behavior are unchanged. No external email was sent by the agent during this refinement.

## Gmail preview alerts — 14 October 2026

Added Admin Settings for editable recipients, unavailable duration, grouping time, optional recovery notifications, test sends, and recent delivery history. Gmail sender credentials stay in the server environment. The feature defaults to disabled, with a 20-minute qualification threshold and 5-minute grouping window. The Node background worker operates without an open browser. Notifications use persisted preview incidents and fresh server observations; recovered, obsolete, missing, unsupported, and stale sources are excluded. Recipient addresses use BCC, and mail content excludes private preview URLs and tokens.

Reviewed routes, Admin/session and same-origin guards, input validation, concurrent settings revisions, schema/migration consistency, worker startup, durable queues, concurrent sender locking, grouping boundaries, recovery, retries, and restart behavior. Definite SMTP failures retry with increasing delays capped at 60 minutes. Interrupted sends with an uncertain outcome remain Unconfirmed to avoid automatic duplicates; partial acceptance is recorded without resending to accepted recipients. Test sends use saved recipients and a database-backed 60-second rate limit.

Verification passed: final production build/TypeScript, ESLint, whitespace checks, runtime dependency audit (zero vulnerabilities), and **526 automated checks**: alerts 60, authentication 189, Reports 51, Activity 62, imports 10, preview health 34, stream recovery 54, monitor summary/timing 21, location filters 9, origin policy 24, and selection logic 12. Alert integration exercises actual SMTP against a loopback fixture and API requests against the standalone server, using disposable databases. The import fixture cleanup was updated for the new queue foreign key. Browser verification covered desktop and 390px layouts, custom timing, multiple recipient edits/save/reload, test-send feedback, and absence of horizontal overflow or captured warnings/errors. Screenshot evidence is ignored under `.server-runtime/email-alert-settings-desktop.png`.

Applied additive migration `0006_email_alerts.sql` to the local development database. Company rollout must migrate before starting the new build. No real Gmail credentials or external recipient messages were used, and no company deployment or GitHub push was performed. Gmail authentication and actual inbox delivery remain an operator setup/test step; configuration presence and SMTP acceptance do not guarantee inbox delivery. Setup is documented in README and the server environment template.

## Monitor and country abbreviation review — 14 October 2026

Reviewed all pending feature source files, API/data paths, tests, styles, database schema/migration, and deployment documentation. Scope: persisted outage footer dates/durations, 60-second warning with unchanged 30-second transport recovery, selection-scoped country/status counts, and optional country abbreviations. Private monitor responses include only selected screens and their aggregate counts; obsolete preview sources and stale observations cannot retain a current healthy status. Missing links remain excluded from displayed previewing/unavailable counts. Abbreviations are Admin-only, trimmed, optional, country-only, limited to 12 characters and unique without regard to casing. Omitting the field preserves existing data, while clearing it restores full-name badges. Controller and Reports use full country names.

Fixed a duration accuracy issue during review: the footer now uses the API server timestamp, independent of the display device's local clock. Added checks with device clocks years ahead and behind, invalid/missing dates and future incident dates. Minute precision follows the existing three-second monitor state poll. Verified recovery hides the footer, changed preview sources discard old incident times, warning retries do not reset the 60-second timer, hidden time does not accumulate, and rotation retains accumulated visible missing-image time. Header/card wrapping is included in wall page sizing.

Verification passed: production build/TypeScript, ESLint, Git whitespace checks and **466 automated checks**: authentication/server 189, Reports/PDF/migrations 51, Activity 62, legacy imports 10, preview health 34, stream recovery 54, monitor summary/timing 21, location filters 9, origin policy 24 and screen selection 12. Database integration tests use independent disposable databases. Prior visual checks covered desktop/390px headers, All locations/country/region/location changes, the Admin abbreviation editor/save, monitor abbreviation and full-name hover. Latest simplified field wording was checked in source and builds; user screenshots also confirm the final monitor badge. Standalone includes header/footer styles, report font and logo; it contains no bundled .env files. Runtime test fixtures were removed and evidence remains ignored.

Deployment must run `npm run db:migrate`, including additive `0005_country_short_names.sql`, before starting the new build. The migration is applied locally and does not rename existing countries. Health returns 503 if the required column is missing. Migration checks accept identical LF/CRLF SQL while still rejecting changed SQL; both cases were tested. Runtime dependency audit reports zero known vulnerabilities. Full audit retains five pre-existing high-severity development-tool findings in the ESLint/fast-glob/micromatch/braces chain; its forced fix proposes eslint-config-next 14.2.35 for this Next 16 project. No dependency change was introduced by these features.

No unresolved defects were found in the reviewed feature changes. The unrelated pre-existing untracked vite.config.ts is outside this release scope. Work is on main and has not been committed, pushed or deployed to the company server by this review.

## Final review before GitHub push — 13 October 2026

Reviewed every pending Reports source/configuration change: Admin navigation and page guard, both report APIs, query validation and parameterized SQL, duration boundaries, incident transactions and source-change reconciliation, checker persistence callbacks, live filter request ordering, PDF rendering/assets and standalone preparation, schema/migration agreement, documentation and fixture cleanup. Fixed the health endpoint so missing preview state or incident tables return 503 rather than reporting a healthy deployment. Added checks for both missing tables and recovery after restoration.

Verification: production build/TypeScript and ESLint passed. 406 automated checks passed: Reports 47, authentication/server 165, Activity 62, imports 10, preview health 29, OnSign stream recovery 48, location filters 9, network-origin policy 24 and Controller/Monitor selection 12. Report tests use isolated PostgreSQL and cover exact inclusive/exclusive duration boundaries, filtering, access control, incident recovery, obsolete observations, pagination, PDFs and deployment health. Standalone includes the report font and PIXCOM logo. Git diff whitespace checks passed; no environment files, runtime evidence or database backups are tracked. Work remains on main and has not been pushed.

Production audit: zero known vulnerabilities. Full audit: five existing high-severity findings in the development ESLint/fast-glob/micromatch/braces dependency chain remain; npm's suggested forced fix downgrades eslint-config-next to Next 14 and is incompatible with this Next 16 project. Final live-browser automation remains blocked by browser policy; user screenshots confirm current labels/layout but do not cover every interaction. Company-server migration and deployment remain separate release work.

## Report duration ranges — 13 October 2026

The default is All: 20 minutes or more. Individual ranges are lower-inclusive and upper-exclusive at 20/60/120/180/300/600 minutes; the final range is 10 hours or more. Both report and PDF APIs parse the same duration selection and apply the same SQL conditions, with a consistent timestamp for counts and rows. Legacy threshold-only requests retain their previous minimum-duration semantics. Production build/TypeScript, ESLint and 44 Reports integration checks passed, including seven range selections, every exact boundary, invalid duration input and range PDF export. The range PDF was rendered and inspected; extracted text confirmed the range label and expected included/excluded screens. Live browser interaction remains a manual check because browser access was blocked in this session.

## Live Reports filtering — 13 October 2026

Reports dropdowns now filter immediately, search waits 300 milliseconds, and Clear filters replaces Apply/Clear. Filter changes reset pagination; dependent location choices reset when their parent changes. The existing request sequence and cleanup guards prevent obsolete responses from replacing current results. PDF downloads and pagination remain disabled while search or results are pending, using a recorded result query to match displayed filters. Existing rows and empty-state height are retained during refresh. Production build/TypeScript, ESLint and all 29 Reports integration checks passed. These integration checks verify server filtering and export behavior; the live typing interaction still requires manual browser verification because browser access was blocked by policy in this session.

## PDF report clarity — 13 October 2026

Renamed the PDF column to Unavailable duration and added Unavailable since with the incident's start date/time in GST. Rebalanced all six columns, wrapped the header text and measured rows using their actual fonts. Production build/TypeScript, ESLint and all 29 Reports integration checks passed. Text extraction verified both headings on every page; rendered inspection covered the two-screen sample and all five pages of a longer export without clipping or overlap. Local preview rebuilt and restarted; download a new PDF to see the updated format.

## Admin preview reports — 13 October 2026

Added Admin Reports with 20/60/120/180/300/600 minute thresholds, cascading country/region/location filters, literal search, longest-first ordering, 25-row pagination, minute refresh and PDF export across all matching pages (maximum 5,000 rows). Reports record first failed checks, last successes, checks and recovery in PostgreSQL. Missing/unsupported preview links are excluded; replaced links close their old incidents. Deleted screens cascade to their records. Tracking begins after this release; checks cannot prove physical-player downtime or reconstruct earlier history. Verification delayed identifies observations older than five minutes.

Reviewed migration/schema consistency, per-screen transaction locks, old-result ordering, link-change races, Admin guards, SQL parameters, pagination limits, PDF packaging and stale UI responses. Fixed obsolete-link results overwriting current observations, an unsafe enormous page value, a PDF font that rendered invisible text, and export errors hiding valid report rows. Refresh keeps existing rows while loading, and location filters reconcile with updated inventory. Generated runtime bundles are excluded from ESLint.

Verification: production build/TypeScript and ESLint passed. 388 automated checks passed: Reports integration 29, authentication/server 165, Activity 62, imports 10, preview health 29, stream recovery 48, location filters 9, origin policy 24 and selection logic 12. Reports integration covers all duration choices, persistence across new checker startup, recovery, obsolete/out-of-order observations, access restrictions, filters, pagination, multi-page and empty PDF exports. Production dependency audit reported zero vulnerabilities. Browser checks confirmed desktop and 390px layouts, cascading filters/search, pagination and PDF download, with no captured warnings/errors. All five pages of the final sample PDF were rendered and visually inspected. Evidence is under ignored `.server-runtime/reports-desktop-verified.png` and `.server-runtime/preview-report-sample.pdf`.

Applied the additive migration to the local development database and verified all eleven existing data tables unchanged. The local server was rebuilt and restarted. Company rollout must run `npm run db:migrate` before starting this version. No GitHub push or company-server deployment was performed for this change.

## Controller scrollbar stability — 13 October 2026

Reproduced a 15px loss of content width when the page scrollbar appeared. The Controller now reserves a stable root scrollbar gutter across all three tabs, with an always-scroll fallback for browsers without gutter support. This is scoped to the Controller; the full-screen monitor is unaffected. Browser measurements confirmed identical card positions and widths between short and scrolling results at 1280px, 1920px and 390px, with no phone horizontal overflow or browser warnings/errors. Expanded details were also checked. Production build/TypeScript and lint passed.

## Preview issues simplification — 13 October 2026

Replaced the summary/status dropdown with quick Unavailable and No link filters, plus Awaiting checks when pending or selected. Other statuses remain accessible under More filters. Country, Region, Location and search remain available. Clear filters appears only with an active non-default filter. Rows show a relative check time; native expandable Details retain the exact GST timestamps. Single-page pagination is hidden, and queue timing/player-status context is under How checks work.

Verification: production build/TypeScript and lint passed; 85 focused checks passed (location filters 9, preview health 28, stream recovery 48). An isolated browser fixture verified status filtering, geography/search, advanced-filter collapse, individual and filtered bulk wall selections, busy-state protection, recovery without automatic wall changes, pagination above twenty rows, and empty results. Desktop and 390px layouts were inspected without horizontal overflow. This was a presentation change; no company data or server deployment was changed, and nothing was pushed.

## Pre-push review — 13 October 2026

Reviewed the active application routes, authentication/role checks, request limits and origins, PostgreSQL queries and transactions, Admin account and inventory forms, activity filters/pagination, Controller selections, monitor access and rotation, OnSign streaming and preview-health queue/probes, migrations/imports, standalone assets, Windows scripts and container configuration. Unchanged vendored UI components were covered by lint and compilation; the retained D1/Sites files are historical and are not the active runtime.

Fixed three issues during this review:

- Stream status/recovery callbacks could dispose or pause a preview while its handler was still running, allowing new timers to be scheduled afterward. Timer scheduling now respects the stopped/paused state. A regression first failed against the previous implementation and then passed with the fix.
- Preview issues could retain a deleted or moved country/region/location filter after a live inventory refresh. Invalid descendants now reset, while valid filters and the wall selection remain intact. The browser fixture verified location reparenting and region removal without React warnings or errors.
- The Windows LAN firewall helper assumed its result-log directory existed. It now creates that directory before applying a rule. PowerShell parsing passed; no firewall rule was changed by this review.

Verification: **358 automated checks passed**: authentication/server integration 165, activity query/API 62, origin policy 24, selection logic 12, stream recovery 48, preview queue/decode/probes 28, changing-location filters 9, and SQLite import 10. Lint and production build/TypeScript passed. A read-only backup restored into a disposable local database with all **12 tables** matching. Integration tests used random disposable databases and cleaned them up. The rebuilt laptop server returned HTTP 200 for health and the character PNG; Sharp and the PNG are present in the standalone package, and no `.env` file remains in that package.

The current npm production audit reports zero known vulnerabilities. The full audit retains five high findings in the development ESLint/fast-glob/micromatch/braces chain. Its proposed lint-config downgrade to Next 14 is not an appropriate fix for this Next 16 app; those findings remain unresolved and are not part of the standalone production dependency set.

Git whitespace checks passed. A credential-pattern scan covered 199 text files among 211 publishable files; its only flagged file was the reviewed local setup script's generated-password template, not a stored password. Private environment files, runtime logs, fixtures and the backup remain ignored. GitHub `main`, `production`, and local HEAD still point to `e928ae7d762a4e3648b1405c47e0ac6e74b05ed1`; the reviewed changes are local and uncommitted. No push, production release or company-PC deployment was performed.

Remaining limits: preview observations do not establish physical player status, server networking can affect all previews, large inventories take longer to scan, and the provider protocol is not a guaranteed API. The new checker still needs verification on the company PC's outbound network after a separately authorized release. Company startup, scheduled backups and prolonged unattended operation were not retested here. This review found no remaining blocking defect in the reviewed application paths; it is not a guarantee of defect-free software.

## Controller preview issues — 12 October 2026

Added Preview issues beside By location and Groups. Authenticated staff can read all-screen preview observations, filter by geography/status, search and paginate twenty rows at a time. Opening the tab and changing filters do not change the wall. Explicit buttons select the current filtered failures (maximum 500) or one screen. Successful rechecks remove recovered screens from the unavailable list without silently changing an already chosen wall selection.

A singleton checker starts with the Node server, reloads inventory every fifteen seconds, limits checks to three concurrent connections and uses the existing OnSign protocol at its fixed WSS endpoint. Each probe waits at most thirty seconds for a decoded JPEG, closes its socket after success/deadline/cancellation and becomes eligible for rechecking sixty seconds later. Decode limits are 8MB, sixteen million pixels and three seconds. Sharp is declared as a direct dependency. No images or raw tokens are exposed by the API or retained as snapshots. Missing links and unsupported URLs are separate; arbitrary saved URLs are never fetched. Deleted/changed links cancel old probes. Results older than three minutes become unknown; memory observations reset on server restart. A large queue can take longer than a minute to revisit every screen. Connectivity observations concern preview delivery, not physical player status.

Verification: 251 automated checks passed (165 standalone authentication/integration, 28 server checker/decode/probe checks, 46 monitor stream checks and 12 selection checks). The integration suite verifies inventory discovery on the real server, Admin/Controller access, anonymous/private-monitor denial, no-store responses, no URL/token exposure and a read-only endpoint. Lint, production build/TypeScript and Git whitespace checks passed. An isolated browser fixture verified tab opening preserves selection; explicit wall actions; search; cascading filter reset; pagination; missing-link category; recovery removal and a 390px phone layout without horizontal overflow. A visual check prompted consistent 44px action buttons. Fixtures were removed; only the ignored screenshot remains. No company inventory was changed, no GitHub push was made, and the company PC was not deployed.

## Character preview warning — 12 October 2026

OnSign cards now show the supplied company character, an amber warning icon, "Connection lost" as the heading and "Preview unavailable" underneath after 30 seconds of active preview time without a successfully rendered image. The existing socket retry logic continues behind the warning. A fresh image clears the warning and resets its deadline; valid black images still count as received images. The heading refers to preview delivery and does not establish that the player is offline.

Each preview retains missing-image progress within the monitor workspace across page rotations. Three unsuccessful ten-second visits accumulate thirty seconds; time off-page or while the document is hidden does not count. Already shown warnings survive rotation until an image succeeds. Reloading the monitor or removing a preview from the selected scope clears this in-memory progress. The label describes preview availability, not confirmed player connectivity. Non-OnSign iframe previews and screens with no configured URL keep their existing behavior.

Warning styling now uses a static dark burgundy gradient with a muted red inset border, light heading, soft rose secondary text and the existing amber icon. The inset border preserves layout dimensions and the caption remains unchanged. Contrast against the lightest gradient color measures 12.23:1 for the heading, 8.27:1 for secondary text and 7.89:1 for the icon. Lint, all 46 recovery checks and the production build passed after this styling update.

Verification: 46 stream checks pass, including early repeated failures, recovery, pause/resume, disposal, cumulative page visits and retained warnings. Repository ESLint and production build/TypeScript pass. A temporary browser fixture rendered the actual warning component at 300px, 455px and 618px card widths with the complete character and readable messages. Original character PNG retained unchanged; CSS frames the character within the supplied transparent canvas. No live inventory, company-PC deployment or production branch was changed.

Latest review: 13 October 2026.

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
## OnSign player linking and device details — 19 October 2026

- Added an optional player association in Add/Edit screen, with player-name/ID search and preserved selection while filtering. Existing preview URLs and alert behavior remain independent.
- Added Details immediately before Preview link, with a read-only modal for connection, last contact, content download progress, 24-hour error/warning counts, device versions and available network information. Includes empty/error states, GST timestamps, refresh, mobile layout rules and keyboard focus restoration.
- API access is restricted to Admins. The token is server-only; upstream requests use a fixed HTTPS endpoint, reject redirects, use GraphQL variables, enforce timeouts and redact upstream errors. Player lists paginate and cache for five minutes; details cache for one minute, with concurrent request deduplication and short failure backoff. No automatic polling or device mutations were added.
- Added migration 0009 and a schema readiness check. Changed mappings are verified against the account before saving; unchanged links remain editable during an API outage, older clients preserve links, and Admins can unlink without API access. One player may drive multiple screens.
- Verification passed: production build/TypeScript, ESLint, 121 mocked API checks, 25 isolated production-server checks, 213 authentication/inventory checks, 92 email checks, 140 WhatsApp checks, 51 report checks, 46 Activity integration checks, 16 activity query checks and 10 legacy import checks.
- Browser verified linked/unlinked details, player search and replacement, connected/disconnected states, refresh, light/dark desktop rendering and Escape focus restoration using a disposable database and mocked OnSign responses. Test server/database were removed. Screenshot: ignored `.server-runtime/onsign-details-final.png` (test data).
- Applied the migration to the local development database. Live-account verification is pending: no `ONSIGN_API_TOKEN` is configured locally. No production deployment or Git push performed.

### Sephora organization selection — 19 October 2026

- Replaced the default-organization queries with explicit organization-ID selection for player lists, mapping validation and device details. The server discovers the unique whole-name match for Sephora across paginated organizations; missing or duplicate matches fail without a default-organization fallback.
- Added optional server-only `ONSIGN_ORGANIZATION_ID` configuration. A configured ID is authoritative and supports a future organization rename. Token/organization changes invalidate caches; organization discovery is cached and shared between concurrent requests. Requests are bounded by timeouts and reject unexpected organization IDs or partial results.
- Added tests for multiple brands, organization pagination, absent/ambiguous/inaccessible organizations, malformed responses, configured IDs and cache changes. The production-server fixture verifies that neither new links nor old saved links can return another brand's player data.
- Production build/TypeScript, lint, 349 mocked API checks, 27 isolated OnSign server checks and 213 authentication/inventory regression checks passed. Live-account verification remains pending until the real token is configured. This follow-up changed only the OnSign client, its configuration example, related tests and documentation; no additional schema/UI changes or production release.

### Dedicated screen details page — 19 October 2026

- Replaced the OnSign Details modal with an Admin-only page at `/admin/screens/[screenId]`, retaining the existing sidebar and light/dark themes. Details is now a link that supports bookmarks/new tabs. The page provides Back to screens, refresh, status and responsive cards for connection, diagnostics, device and network information, using normal page scrolling.
- Direct page requests validate Admin access before reading the requested screen and location hierarchy. Missing or non-screen records return 404. The page reads only the requested screen rather than loading the complete inventory; Details links disable automatic prefetch to avoid unnecessary device-page requests across long screen lists.
- Production build/TypeScript, lint, 33 isolated OnSign server checks and 213 authentication/inventory checks passed. Browser verified Details navigation, return to Screens, page reload, refresh, unlinked-screen guidance and desktop rendering in light/dark mode with mocked OnSign responses. Screenshot: ignored `.server-runtime/onsign-details-page.png` (test data). Disposable test server/database were removed.
- OnSign organization selection, API/cache behavior, preview monitoring and alert rules were not changed. No new migration, Git push or production deployment.

### Screen editor width and OnSign picker — 20 October 2026

- Constrained the screen editor grid and controls so long player names cannot widen the dialog. Replaced the native player dropdown with the existing styled Select, bounded to the viewport with wrapping option names and an ellipsis on the selected value.
- Preserved player search, saved selections while filtering, keyboard selection and existing mapping/API behavior. Layout rules are scoped to the screen editor and OnSign picker.
- Production build/TypeScript, lint and 33 isolated OnSign server checks passed using an optional fixture with 30 exceptionally long player names. Browser verified no horizontal overflow, bounded dropdown dimensions, visible Save/Cancel controls, saving/reopening a long-name selection, search preservation and Escape closing only the dropdown. Screenshot: ignored `.server-runtime/onsign-picker-width-fixed.png` (test data).
- Test server is stopped. Cleanup of disposable database `sephora_onsign_test_65916e12d5c2cc99` was attempted but remains pending because the local PostgreSQL server at port 55432 is unavailable. No Git push or production deployment.

### Expanded read-only player details — 20 October 2026

- Added all documented direct player fields to the existing Details page: device/software and update metadata, full network interfaces including MAC addresses, working hours/exceptions, reported location, tags/custom attributes, notes and license information. Overview stays visible; additional cards are collapsible. Missing values remain distinct from zero, false and empty lists; schedule times retain the player's local time context.
- Added independently loaded, paginated lists for active alerts, saved captures, groups and all six published playback loops, including trigger/action metadata. Group content requires membership in the linked player. Fixed GraphQL selections and variables remain scoped to Sephora; Admin access, timeout, one-minute caching and safe upstream errors apply to every section. Content permission failures leave basic details available. Capture images are not automatically loaded; capture downloads require an explicit HTTPS link click. Trigger URLs are text only and never executed. Nested playlists remain published assignments rather than recursively loading the organization library.
- Production build/TypeScript, lint, 497 mocked API checks and 45 isolated production-server checks passed. Live read-only queries also succeeded against the configured OnSign account for extended details, alerts, captures, groups and all six player loops. Live content verification caught and corrected the PlaylistItemConnection edges selection before completion.
- Browser verified expandable cards, long-value wrapping, null/zero/false rendering, alert pagination, group assignments, trigger metadata and light/dark rendering. At a 390px viewport no detail cards or fields overflowed horizontally. Browser error/warning log was empty. Screenshot: ignored `.server-runtime/onsign-expanded-details.png` (disposable test data).
- Earlier pending disposable database cleanup completed after PostgreSQL became available. Changes are confined to OnSign details/API, related fixtures/tests and documentation. No schema migration, alert-rule, controller or session changes in this follow-up. No Git push or production deployment.

### Physical screen photo — 20 October 2026

- Added one optional JPG/PNG/WebP photo to Add/Edit Screen, with preview, replacement, removal and undo. Multipart screen saves retain the existing JSON path for other actions. Photo reference changes commit with the inventory update; failed validation/transactions remove staged files, older clients preserve photos, and stale photo replacements return 409. Successful replacement/removal and screen/parent deletion remove obsolete files after commit.
- Added a small Details thumbnail and accessible large-image dialog, independent of OnSign configuration. The full image loads only when opened; Close/Escape restore thumbnail focus. Missing/unavailable images have explicit states. Images retain proportions and the modal fits desktop and phone viewports.
- Uploads are bounded to 5 MiB, accepted raster signatures and decoded JPEG/PNG/WebP formats, non-animated images and 50 megapixels. Sharp applies camera orientation, strips metadata, converts to WebP, bounds the larger image to 2400 pixels per side and creates a thumbnail within 320 × 240. Storage keys are random, never user filenames. The image endpoint requires Admin access, verifies the current screen reference, serves only private/no-store WebP responses and rejects arbitrary paths.
- Migration 0010 adds a constrained, unique photo reference and health checks for schema readiness. Applied to the local development database. Photos live in a private persistent folder (configurable absolute SCREEN_PHOTO_DIR), with defaults outside .next/standalone and excluded from Git. README explains deployment permissions and combined database/photo backups. Production migration/deployment remains pending release authorization.
- Verification passed: production build/TypeScript, lint, 13 image/storage/request checks, 68 isolated OnSign/photo integration checks and 213 authentication/inventory regression checks; the existing 497 OnSign API checks also passed. Browser verified selecting a file, Cancel/reopen, actual multipart Save, Details thumbnail, larger image loading, Close/Escape, focus restoration and phone layout with no horizontal overflow. Browser warning/error log was empty. Proof uses synthetic disposable test imagery: ignored .server-runtime/screen-photo-thumbnail.png and screen-photo-modal.png.
- Changes are limited to physical photo UI, storage/API, necessary inventory/schema/health wiring, related tests, configuration and documentation. Existing alert rules, session policy, preview monitoring and controller behaviour were not changed. No Git push or production deployment.

### Wider screen editor — 20 October 2026

- Scoped Add/Edit Screen to a responsive 900px dialog with two desktop columns: screen/location on the left and preview/photo on the right. The header and Save/Cancel footer remain outside the scrolling field area. Viewports at 700px or narrower use one column. Other entity editors retain their original form and sizing; submit handlers and backend logic are unchanged.
- Production build/TypeScript, lint and 68 isolated OnSign/photo server checks passed. Browser verified Add and Edit, a saved photo, unchanged-screen Save, Cancel/reopen and unusually long player selection without horizontal overflow. Desktop measured 900px width; scrolling fields by 226px left header top at 17px and footer bottom at 703px in a 720px viewport. At 390px phone width the dialog measured 343px, with one column, no horizontal overflow and footer bottom at 827px in an 844px viewport. Country editor retained 512px width without screen-specific styles. Browser error/warning log was empty.
- Proof: ignored .server-runtime/screen-editor-wide.png using disposable test data. No API, schema, alert, session or controller changes in this layout follow-up. No Git push or production deployment.

### OnSign content and downloads — 20 October 2026

- Details now opens Content & downloads with reported download progress, last completed synchronization, last content/settings change and retained diagnostic fields. Disconnected players explicitly show that values reflect their last report. No claim is made about current playback or an exact inventory of files cached on the device.
- Published content and group loops offer named media links only for Content nodes in documented item/action positions with credential-free HTTPS URLs. Trigger playLink URLs remain inert text; repeated media URLs are deduplicated. Links are labelled server copies and may display or download depending on the browser. Missing links do not invent a download action. Existing lazy loading, pagination, permissions and query cache remain unchanged.
- Verification: production build/TypeScript and standalone packaging, lint, 497 mocked OnSign API checks, 68 disposable-database server checks, and focused content helper/server-rendering checks passed. The first sandboxed build reported a dependency-copy permission warning; a rerun with filesystem access completed without it. No new live account downloads or interactive browser verification were performed for this follow-up.
- This follow-up changes only OnSign Details presentation, its content helper/tests and documentation. No API query, schema, alerts, sessions or controller changes. No Git push or deployment.

### Playback loop selector contrast — 20 October 2026

- Replaced only the OnSign playback-loop native select with the dashboard's existing themed Select component. Reuses location-option colors, bounded popper placement and selected-item checkmarks. Uses a unique label/trigger ID for each player/group loop selector. All six loop values and content-fetch logic remain unchanged. Removed the obsolete native-select rule in favor of a scoped trigger width rule.
- Verified production build/TypeScript and standalone packaging, focused lint/content checks, whitespace checks and 68 isolated server checks. Browser verified all six readable options in dark/light mode, ArrowDown/Enter changing Primary to Fallback with matching returned loop kind, Escape closing the menu, and no warning/error logs. Proof: ignored .server-runtime/loop-dropdown-dark.png and loop-dropdown-light.png. No API, schema, alert, session or controller changes; no push or deployment.

### Compact published content cards — 20 October 2026

- Changed only the OnSign published-content presentation to two compact cards per desktop row and one at 900px or narrower. Cards show the library/trigger name, type, assignment paused state and reported duration. Media links remain immediately accessible. Loop IDs move under Loop information; every original record field, including nested restrictions and content metadata, remains available under each card's More details disclosure. Expanded nested fields use one column inside the card, avoiding tall restrictions stretching unrelated fields.
- Reuses existing queries, lazy loading, cursor paging and media safety checks, including group content and trigger records. Zero/false values and unavailable fields remain explicit. No fields or API data were removed.
- Verified production build/TypeScript and packaging, focused lint, content checks, whitespace checks and 68 isolated server checks. A OneDrive reparse-point error in generated .next/types was resolved by clearing only that verified generated folder before rebuilding. After final label clarifications, TypeScript/lint/content checks passed again. Browser checked desktop two-column tracks (447.5px each), disclosure click/Enter, full nested fields, media links, trigger metadata, light/dark presentation and 390px phone layout (one 301px card column), including expanded details with no horizontal overflow. Browser warning/error log was empty. Disposable app/database/photo fixtures were cleaned.
- Proof: ignored .server-runtime/onsign-content-cards.png. Only content JSX, scoped CSS and these review notes changed in this follow-up; no alert, session, controller, API or schema changes. No push or deployment.

### Compact header photo — 20 October 2026

- Moved the Details-only physical photo control into the header immediately before the theme toggle and removed the wide photo panel. A 44 × 32 thumbnail and View photo control open the existing full-image dialog; empty screens show a compact No photo indicator with an Edit Screen hint. Failure states remain available. Existing photo upload/storage/API and modal loading behavior are unchanged. The shared header wraps on smaller screens using its existing responsive layout.
- Verified production build/TypeScript and standalone packaging, focused lint, whitespace checks and 68 isolated server checks. Browser verified the loaded thumbnail and full image, modal Escape/Close, focus restoration on Close, both themes, no-photo state and a 390px phone layout with no horizontal overflow. Photo control measured 153 × 42 on phone. No old wide photo cards remain; browser warning/error log was empty. Proof uses a synthetic test photo: ignored .server-runtime/screen-photo-header.png.
- Changes are limited to photo presentation, its Details header placement and these review notes. No alert, session, controller, schema or API changes. No push or deployment.


## Pre-push review — 12 November 2026

Scope: pending CMS playback-period status/filter and Screens OnSign connectivity, Wi-Fi SSID and OS filters, plus regression coverage across the current Next.js/PostgreSQL application. Reviewed changed source, API authorization and parameter binding, OnSign organization scoping/pagination/cache/error handling, date boundaries, filter composition, PDF/export paths, photo storage protections, migration transactions and standalone/deployment packaging. No release-blocking application defect was identified in these checks; this is verification evidence, not a guarantee that every possible defect is excluded.

- Full ESLint, production build, TypeScript and standalone asset preparation passed.
- All 24 applicable unit/logic/PDF/migration suites passed. PDF inspection used the existing private PDF test Python environment via `PDF_TEST_PYTHON`; initial missing-library failures in the default Python environment were resolved by selecting that environment, without application changes.
- All 10 current isolated PostgreSQL server suites passed: Activity (46), authentication/inventory (337), CMS (61), email alerts with local SMTP (92), SQLite import (10), OnSign/photos (137), preview reports (100), screen details PDF (23), survey import (39), WhatsApp alerts with local mock provider (140): 985 integration checks. No client messages were sent by these tests.
- CMS status checks cover GST midnight, inclusive start/end dates, combined filters, pagination and invalid inputs. Upcoming/Active/Expired remain date-based and do not claim live playback.
- Browser fixtures using the real OnSign React component/hook passed individual/combined filters, exact Wi-Fi names, missing/unlinked states, chip removal, independent clear controls, retry and snapshot reuse. Tested 1440px dark/light, 800px and 390px; CMS badge/filter layout fixtures passed at 1440px, 800px and 390px. These fixtures are scoped browser checks, not a new end-to-end exercise of every page.
- Read-only live verification: 199 OnSign players, two reported OS versions and 11 Wi-Fi names; 4,032 independent comparisons passed across synthetic cases, the current 18-screen inventory and anonymized organization-wide fixtures with geography/search combinations. Dropdown values remain scoped to linked inventory screens, so organization-wide names need not appear in this local inventory.
- A read-only database dump restored into a disposable PostgreSQL database, with all 29 public tables matching the same source snapshot. Private backup and temporary test outputs remain ignored under `.server-runtime`.
- Dependency audit: zero production/runtime vulnerabilities; seven moderate development-only findings in the ESLint/typescript-eslint dependency chain, originating in minimatch advisory GHSA-g3hv-75wg-m249. No high or critical findings. Dependencies were not changed during this review.
- Tracked-file hygiene found no tracked environment files, upload folders, private backup files or private-key files; checked source for obvious public-secret configuration mistakes. This is a limited local check, not a full Git-history secret audit. Whitespace validation passed.
- Historical Cloudflare/D1 `auth.integration.mjs` is not applicable to the current runtime and was replaced for this review by `auth.server.mjs`. The one-off `migration-preservation.mjs` requires an original SQLite input and was not run; the current isolated import/rollback suite and backup/restore checks passed instead.

No application code, dependency versions, database schema or production configuration was changed by this review. No commit, Git push, production branch update or company-server deployment was performed. Deployment still requires the usual company-server backup/update and smoke checks.


## Client ownership foundation — 12 November 2026

Scope: first database step of the approved multi-client plan. Added migration
`0024_client_ownership.sql`, matching Drizzle schema, readiness checks and migration
regression coverage. The migration creates one Sephora client and adds indexed,
required `client_id` ownership to 22 application tables. Existing writes retain
Sephora through a transitional database default; authentication remains global.
No workspace picker, client management API or additional client is enabled.

Verification:

- Production build, TypeScript, standalone preparation and full ESLint passed.
- All 24 existing applicable unit/logic/PDF suites passed.
- All 10 existing isolated server suites passed (985 checks), including login,
  inventory CRUD, CMS/PDF, hardware/PPM/photos, survey import, SQLite import,
  controller/monitor access and alert workflows with local test providers.
- The new ownership suite passed 213 checks on disposable databases: unchanged
  original values across all application/authentication tables (including binary
  PDFs/images and credentials), existing column definitions and constraints,
  Sephora backfill/defaults/indexes, unknown/null owner rejection, restricted
  client deletion, unchanged migration history, reruns, fresh installation,
  health failures for incomplete schema/seed/history and transactional rollback
  after a deliberately induced late migration failure.
- A read-only dump of the local development database restored successfully into
  a disposable database. Applying the new migration there preserved every
  original value across all 29 existing public tables. Configuration and photo
  folders were also backed up privately under ignored `.server-runtime`.
- Applied locally only after that rehearsal. The guarded application compared
  all original table values inside the migration transaction and committed only
  after preservation and ownership checks passed. A normal migration rerun
  passed. Local production-server health returned `ok`; anonymous inventory
  access still returned 401. Test servers and disposable databases were cleaned up.

Boundary for the next step: ownership metadata alone does not provide tenant
isolation. Before enabling another client, scope authorization, every query and
mutation, relationship ownership, background workers, integrations, file access,
reports and singleton settings by client; replace the compatibility default with
explicit client context. Existing global IDs and singleton behavior are preserved
in this phase deliberately. No dependency or UI changes, Git push, production
branch update or company-server migration/deployment was performed.


## Client permissions gate (phase 2a) — 12 November 2026

Implemented explicit client memberships with existing Sephora admin/controller
backfill. Account creation, first-admin bootstrap and legacy import create
memberships transactionally. Authentication checks membership and archive state
on every application request, caps privileges by both global and membership role,
and refuses unsupported `X-Client-Id` selection. User administration lists and
targets only Sephora members. Existing account/password/session fields remain
unchanged by migration. No membership management UI or other workspace is enabled.

Validation: production build/TypeScript and standalone packaging, full ESLint,
24 unit/logic/PDF suites, the 10 existing server suites (985 assertions), ownership
migration suite (214 assertions) and permission API tests passed. Permission tests
cover other-only membership, revocation/restoration on existing sessions,
privilege reduction/escalation prevention, archive state, private photo/report
endpoints, mutations and account-administration targeting. An email-suite teardown
hit a PostgreSQL 57P01 connection termination after all assertions passed; the
complete email suite passed when rerun alone, without application changes.

A fresh backup was restored into a disposable database and migration 0025 tested
there: every original table value was preserved and all supported accounts received
matching Sephora roles. Applied locally with a transaction guard comparing all
pre-existing table values before commit. Migration rerun and local production
health/protected anonymous inventory checks passed. Backups remain private and
ignored under `.server-runtime`. No push or company-server changes.

This is the permissions stage, not completed tenant isolation. Direct worker SQL,
queries/mutations, relationship ownership, singleton settings, monitor capabilities,
file/report access and OnSign credentials/caches still need client scoping before
adding another client's operational data. Existing Sephora-only behavior is retained
until those changes can be verified independently. Do not treat this stage as a
multi-client release.


## Database and worker isolation (phase 2b) - 12 November 2026

Implemented a fixed Sephora database boundary for this staged release. Migration
0026 creates a restricted non-login runtime role and enables/forces RLS across all
22 owned application tables, with matching read/write ownership policies. Every
shared application/worker pool connection uses this role before its first query;
DATABASE_URL startup options cannot override it. Authentication/membership records
remain global behind the existing permission gate. Schema/migration metadata is
read-only to the runtime. Health checks the runtime identity and migration marker.

Added ownership-aware composite foreign keys for inventory hierarchy, group
membership, hardware/photos/notes/PPM/remote access, CMS report parents and incident/
delivery queues. PostgreSQL defers these checks to transaction commit so existing
transactional deletion/import order remains compatible. Invalid cross-owner links
fail without repairing/deleting records. Drizzle represents the policies, indexes
and relationships; FORCE RLS and initially-deferred FK options are maintained in
the authoritative SQL migration. Offline migration/import tools intentionally use
separate privileged connections.

Validation: production build/TypeScript/standalone packaging, full ESLint and 24
unit/logic/PDF suites passed. Server verification includes the existing 10 suites
(985 assertions), ownership (214), permissions (49) and the new query/worker suite
(220). The new suite covers all 22 tables' read/update/delete/insert restrictions,
forced RLS, cross-owner relationships, attempted schema/RLS bypass, concurrent
pooled connections, overriding connection-string options, global login, private
photo/CMS report endpoints and both inactive/configured worker paths. Injected
senders confirm no foreign-client jobs are delivered and foreign records stay
unchanged. The Activity suite passed all assertions but encountered the existing
57P01 forced-database-cleanup race on the final batch run; an independent complete
rerun exited successfully. No application changes were needed for that teardown.
The new suite avoids force-terminating draining pools during its own cleanup.

A fresh read-only backup of the local development database was restored into a
disposable database and migrated successfully. Every original value across all
31 public tables matched. Applied locally only after this rehearsal, with a guard
comparing every original table value before COMMIT (excluding the new migration
history row); all 22 RLS boundaries were confirmed. Normal migration rerun and
local standalone health/protected anonymous inventory checks passed. The verified
backup is private and ignored under .server-runtime.

This stage does not enable multiple workspaces. Per-client singleton keys,
OnSign credentials/caches, monitor capabilities, storage paths and client selection
remain required before another client's operational data is added. Administrative
migration/DBA credentials are trusted and can bypass RLS; deployment instructions
recommend a separate least-privilege application login. No dependency/UI changes,
Git push, production-branch update or company-server deployment was performed.


## Client settings and integrations (phase 2c) - 12 November 2026

Migration 0027 changes the primary keys of display_state, monitor_access,
email_alert_settings and whatsapp_alert_settings to (client_id,id). It contains
no record updates/deletes. Reads, edits and composite upserts explicitly use the
trusted server workspace as well as the existing forced row policies. Monitor
hashes, generations, alert revisions and display settings are retained.

The server integration resolver supports optional private per-client configuration.
Existing OnSign, Gmail and UltraMsg variables remain Sephora-only defaults. An
explicit client entry replaces all its legacy providers; missing providers stay
disabled. Other clients never inherit Sephora credentials or organization discovery.
Malformed configuration fails closed. OnSign cache identity includes the client,
credential and organization; slow older requests cannot replace newer-scope data.
Email/WhatsApp capture credentials before asynchronous asset/PDF preparation so
account identifiers and secrets cannot be mixed during rotation. No browser or
PDF receives integration secrets.

Display/inventory, hardware, PPM, gallery, CMS and survey import use one shared
client-specific inventory lock. All six callers were audited together to retain
coordination with screen deletion/type changes. Preview recording/reconciliation
share a client/screen lock; alert/monitor locks and worker registration include
client identity. Global account-administration and migration locks intentionally
remain global. UI, domain field validation, provider endpoints and branding stay
unchanged; new client workspaces are still disabled.

Verification: final production build/TypeScript/standalone preparation and ESLint
passed; all 25 maintained unit/PDF suites passed, including 49 new integration/
transport checks with mocked providers. The dedicated settings suite passed 110
checks: upgrade/rerun preservation, composite keys, 22 retained forced RLS policies,
coexisting client settings, private monitor-key isolation/rotation, revision conflicts,
foreign-row preservation, and deterministic blocking/release tests across all six
inventory callers and both preview mutation paths. All 14 production-server
suites passed their final assertions (1,578 total). The batch email suite encountered
the pre-existing 57P01 forced-database-cleanup race after all 92 assertions passed;
an independent complete rerun exited successfully. No application correction was
needed for that test teardown. Both batch and retry logs are retained privately. Configured-secret
scanning found no configured values in 596 maintained/packaged text files and no
packaged .env.local. No real mail, WhatsApp or OnSign calls were made by these tests.

A fresh read-only local backup restored successfully into a disposable database.
Applying 0027 on that restored copy preserved every original value in all 31 public
tables. The separate local development database was migrated only after a guard
compared those values again before COMMIT; all values and 22 RLS boundaries matched.
A subsequent application-role read-only check passed for migration, inventory,
display and alert settings. The private verified backup remains ignored under
.server-runtime. No company database, environment configuration or photo files were
changed; no commit, Git push or release/deployment was performed. Storage scoping,
workspace selection and multi-client branding remain subsequent stages.


## Client photo storage and file access (phase 2d) - 12 November 2026

Both screen and location photo services now use one private storage helper with a
trusted server client identity. New uploads (full image and thumbnail) go under
`<private-base>/clients/client-<clientId>/`. Screen front, gallery/reference images,
location galleries and the optional photos in screen-detail PDFs share this
boundary. Existing role/membership checks and forced database ownership policies
remain required before a key reaches storage. Request headers, query parameters
and upload fields cannot select a filesystem workspace. CMS image/report bytes
remain in the already RLS-protected database; shared public logos/fonts are not
private tenant uploads.

Existing Sephora UUID references and flat-folder files remain untouched. Only
Sephora may read or remove those legacy files. Other clients have no legacy
fallback. Missing files retain the previous endpoint/PDF behavior; unsafe links
and permission errors fail closed rather than falling back. Path traversal,
non-canonical workspace identifiers, directory junctions/symlinks, linked files
and replaced file handles are rejected. Configured photo bases remain absolute;
standalone defaults stay outside the replaceable build directory.

Normalization, orientation, metadata stripping, upload limits and private response
headers are unchanged. Successful replacements/deletions still clean obsolete
files after the database commits. Rejected uploads discard only their newly
namespaced pair; they never remove legacy files. Exclusive writes preserve
existing files during UUID collisions, concurrent collisions or a failed second
write. No bulk move, schema/data migration, photo reference rewrite or permission
change is needed for this step. Backup instructions cover the whole existing base
folder plus its new client children, with PostgreSQL stopped for a consistent copy.

Verification: the final production build, TypeScript, standalone preparation,
ESLint and git diff whitespace checks passed. All 26 maintained unit/PDF suites
and all 15 production-server suites passed (1,637 server assertions). New coverage
includes 87 filesystem checks and 59 HTTP/PDF isolation checks: legacy read
compatibility, full/thumbnail uploads, identical and colliding keys, partial write
cleanup, rejected/stale uploads, foreign resource IDs, public URL denial,
controller permissions, parent cascade deletion and preserved foreign rows/files.
Existing OnSign upload/cleanup assertions now inspect actual client subfolders;
the existing screen-detail PDF suite still reads its old flat-folder fixtures.

All storage/HTTP mutation fixtures use disposable directories and databases.
A read-only compatibility check read all 20 original local photo files through
the new services and matched their private SHA-256 receipts; a final filesystem
comparison confirmed all paths and bytes unchanged. No existing photo was moved,
rewritten or deleted. Package checks found no original private photos, configured
secrets or .env.local in deployment assets (600 maintained/packaged text files
scanned). No real provider calls, local operational database changes, company
server changes, commit, push or deployment were performed in this storage step.
Client selection remains disabled in this staged rollout.


## Client selection and request-scoped isolation — 12 November 2026

Added `/workspaces` after login and a Switch client link. Cards include only
active clients with a valid membership; selection uses an HttpOnly signed cookie
bound to the account and login session. Account and membership roles are checked
on every authenticated request. Global role caps prevent membership-based privilege
elevation. Existing authorized Sephora sessions retain their fallback access.
No example clients or memberships were added to the operational development data.
Client creation, platform administration and membership management UI remain a
separate step; non-Sephora admins cannot use global user administration.

Migration 0028 replaces the fixed Sephora policies with role-derived client scope
on all 22 owned tables. Each client uses a distinct restricted PostgreSQL startup
role and pool; each request/job uses its own AsyncLocalStorage holder. Contexts,
locks, worker registrations, provider credentials, OnSign caches, private photos,
reports and monitor capabilities carry the verified client. Country abbreviation
uniqueness is per client. Archived client preview queues are cleared. Drizzle
policies/defaults match the migration. A same-origin `x-client-id` header is only
a stale-tab guard: it cannot select a client. Monitor capabilities retain separate
validation; existing Sephora monitor URL formats and legacy flat photos work.

Verification: production build, TypeScript, standalone preparation, ESLint and
whitespace checks passed. All 27 maintained unit/PDF suites and 16 server suites
passed on the final implementation. The new scope/cookie suite passed 211 checks;
new two-client HTTP coverage passed 54 checks, including 50 simultaneous requests,
unauthorized/revoked/archived selections, stale tabs, role limits, same country
abbreviations, cross-client photo reads, reports, integration fallback and monitor
keys. Existing auth, OnSign, CMS, survey import, alerts, reports, storage and legacy
SQLite import regressions passed. Browser login, picker, separate client records
and switching passed on a disposable database with no console warnings/errors.

Backup restoration and migration were rehearsed on a disposable restored copy.
The local development database (loopback port 55432 only) was migrated under a
transactional before/after guard: all original values in all 31 existing tables
were preserved (only migration history gained 0028). All 20 original photo paths
and SHA-256 values remain unchanged and readable. A scan of 614 maintained and
packaged text files found no configured secrets or packaged `.env.local`.
No real provider messages, company-server changes, commit, push or deployment were
performed. Production rollout requires a separately authorized release and backup.


## Clients management and user assignment — 12 November 2026

Added a platform-only Clients page at `/admin/clients`, accessible from the
Administration card and platform sidebar link. Client creation provisions an
isolated empty workspace, independent default settings and creator Admin access.
Manage access assigns existing accounts as Admin or Controller; global role caps,
disabled-account restrictions, optimistic versions and enabled-Admin checks are
enforced in the database function as well as the API. Client management has a
separate audit. Client Admin access never grants platform administration.

Migration 0029 adds two global tables and constrained SECURITY DEFINER functions.
Runtime roles cannot write platform mappings or call the operator provisioner.
Existing enabled Sephora Admins are seeded as platform administrators; fresh
first-account activation has a guarded bootstrap. Global Users administration is
platform-only, closing an indirect password-reset escalation path. Global account
disabling/demotion cannot strand a client without an enabled Admin. Existing
client membership changes do not change account passwords or provider settings.

Verification: final production build, TypeScript and standalone preparation pass.
ESLint and whitespace checks pass. All 27 maintained unit/PDF suites and all 17
server suites pass (1,758 server assertions, including 66 client-management
assertions). Coverage includes duplicate/concurrent creation, stale/concurrent
membership saves, role restrictions, revoked sessions, last Admin protection,
private runtime roles, separate settings, audit records and existing regressions.
Browser checks on a disposable database cover creation, assignment, cancellation,
disabled saves and desktop/mobile layouts. The mobile table keeps names readable
and scrolls within its card; dialogs retain usable controls. No browser warnings
or errors were logged in the final check.

Backup restoration and migration were rehearsed. The local development migration
was committed only after a transactional preservation check proved all original
values in all 31 original tables unchanged, except the added migration marker.
All 20 original photo paths and SHA-256 values are unchanged. Test clients and
accounts were confined to disposable databases. No company-server change, commit,
push or deployment was performed. Renaming, archiving and integration setup UI
remain outside this stage.


## Shared Admin/Controller access and common monitoring — 12 November 2026

This step supersedes the assignment/platform-authorization model described in
previous staged reviews. The only account roles are Admin and Controller. Every
enabled account can open every active client through the existing cards page.
Admins manage clients and global accounts; Controllers retain wall control only.
Client selection remains signed and login-bound, with stale-tab guards. Existing
membership/platform rows are preserved but no longer determine authorization.
New clients need a name only and appear for both roles without assignment.
Individual actor identity remains recorded in account/inventory/wall activity and
client creation auditing. Disabled accounts and archived clients are rejected.

Client-owned database rows, settings, integrations, provider caches, workers,
photos and reports remain separate. Shared staff access never changes the
selected client's data boundary. Migration 0030 replaces the bounded creation
function, revokes the old platform bootstrap capability and adds an independent
common-monitor capability table. It does not rewrite existing operational data.

Admins can create a common read-only monitoring URL from Clients or Settings.
Its dropdown shows active clients and loads the selected client's current wall.
The secret is returned once in the URL fragment and stored only as a hash.
Replacement/disable detects stale generations and revokes old common links.
Existing Sephora/per-client links remain independent and unchanged. A common key
cannot access staff APIs or modify wall controls. Invalid supplied keys cannot
fall back to a logged-in session. Monitoring never changes saved wall selection.

Verification: production build, TypeScript, standalone preparation and ESLint
pass. All 17 server suites and all 27 unit/PDF suites passed. The final dedicated
shared-access/common-monitor suite passes 82 integration assertions, including
Controller wall changes affecting only the selected client, monitor switching,
read-only enforcement, link replacement/revocation, restricted runtime roles,
named audit actors, concurrent duplicate creation and Sephora data preservation.
Browser checks on a disposable database confirmed Admin/Controller client cards,
client creation form cancellation, shared-access Clients layout, switching back
through cards, and the common monitor dropdown switching between two clients.

A fresh database backup was restored and migration 0030 rehearsed on a disposable
copy before applying it locally. A transaction compared all existing values in
all 33 pre-existing tables: original values were preserved, with only the new
migration marker added. All 22 forced row-security tables remain protected.
All 20 existing photo paths and SHA-256 contents remain unchanged. Test clients
and accounts were confined to disposable databases, which were removed after
verification. A Windows build-file lock held by the disposable browser server was
resolved by stopping that fixture; the subsequent production build passed.

The company server was not changed. No commit, push or deployment was performed.
Real provider delivery and company-server acceptance remain deployment checks.
Client renaming, archiving and integration-configuration UI are outside this step.

## Client logos and Administration navigation — 12 November 2026

Clients management is now available only through Administration. Client sidebars
retain Switch client, which returns staff to the existing cards page. Optional
logos appear beside client names in the cards, Administration list, selected
client sidebar and Controller header. Names remain visible, missing/unavailable
logos use an icon, and uploaded images retain their full proportions. Admins can
add, replace or remove a logo; cancelling leaves the saved logo unchanged.

Migration 0031 stores logos separately from operational records. Uploads accept
PNG, JPEG or WebP up to 2 MB, validate and decode the actual image, and normalize
to a bounded WebP. Reads require a staff session; writes require an enabled Admin
and same-origin requests. Version checks reject stale edits, and audit entries
record the individual actor. Optional logo creation is atomic with client creation.
No new upload folder or environment variable is required; database backups include
logos. Public/common monitoring capabilities cannot retrieve staff logo assets.

Verification: production build, TypeScript, standalone preparation and ESLint
pass. All 17 server suites and 28 unit/PDF suites passed. The expanded client
management suite passes 126 assertions and the image/upload unit suite passes 20.
Coverage includes authorization, image validation, concurrency, cancellation,
existing client compatibility, audit records and private asset access. Browser
checks using disposable data confirmed desktop/mobile layouts, image previews,
saving, cancelled removals, Admin-only Administration access, Controller branding,
client switching and removal of Clients from client sidebars. The final browser
check logged no warnings or errors.

A fresh local database backup was restored and migration 0031 rehearsed before
local application. A transactional comparison verified every existing value in
all 34 pre-existing tables was preserved, except the new migration marker. All
22 forced row-security tables remain protected. All 20 original photo paths and
SHA-256 contents remain unchanged. Real Sephora logos were not added or changed;
logo testing used disposable databases, which were removed after verification.
No company-server changes, commits, pushes or deployments were performed.

## Controller-driven common monitoring — 13 November 2026

The common monitoring link now follows the client opened in Controller and that
client's saved wall selection and rotation settings. The common wall has no
client dropdown and ignores client overrides in its URL. Admin workspace browsing
never changes the common wall. If multiple Controllers are opened, the most
recently opened Controller selects the client; routine polling from older tabs
does not take control back. Individual client monitoring links remain independent.

Migration 0032 adds a separate common-wall client pointer, initially Sephora.
Controller activation requires an enabled Admin/Controller, an authenticated
workspace and a same-origin POST. It ignores client IDs supplied in the body and
records the individual actor. Common links remain read-only, retain their existing
key lifecycle and cannot authenticate staff APIs. Archived targets are rejected
until an active client is opened in Controller.

Verification: production build, TypeScript, standalone preparation and ESLint
passed. The dedicated shared-client/common-monitor suite passed 152 integration
checks; client selection, ownership, permissions, query isolation, settings,
photo access and authentication regression suites also passed. Browser checks on
a disposable database confirmed automatic client and country changes on the
already-open common wall without reloading, no client dropdown, and no logged
browser warnings or errors. Individual-link independence, key preservation,
stale-tab guards, revoked keys and disabled accounts were covered by integration
checks.

A fresh local database backup was restored into a disposable copy and migration
0032 rehearsed, preserving every row in all 35 pre-existing public tables except
the new migration marker. Reapplying the migration was idempotent. After backup
verification, the local development migration preserved existing operational
records, individual/common monitoring keys and logos. All 20 existing photo paths
and SHA-256 contents remained unchanged. Temporary browser/server fixtures were
removed. The company server was not changed; no commit, push or deployment was
performed.


## Full pre-push review - 13 November 2026

Reviewed the current main working tree, including earlier uncommitted multi-client
work and the latest branding/card changes. Existing work was retained. Scope
covered the 38 API route files, page routing, authentication and global roles,
workspace cookies and stale-tab guards, database pools/RLS and migrations,
inventory CRUD and cascading deletes, scoped photos and filesystem paths,
branding uploads/concurrency, Controller/common and individual monitor links,
OnSign/provider boundaries, incident/alert workers, CMS and report validation,
PDF exports, client request state/error handling, and build/release configuration.
An additional source-control scan covered 385 source/config/documentation files
for common private-key/token patterns and tracked environment files; none were
found. This is a targeted scan, not proof against every possible secret format.
All API route files use the request-local workspace wrapper. The build resolves
TypeScript imports and application route paths.

Review corrections:

- Health readiness now requires migration 0033 and the background storage columns.
  Previously a release missing that migration could pass health while client
  selection/Administration failed. Regression checks cover missing migration
  history, missing background storage and recovery when restored.
- The migration-preservation test now excludes the new client_backgrounds table
  from its comparison of pre-existing columns. It still compares the types,
  defaults, nullability, constraints and values of all original tables.
- Corrected malformed ellipsis and separator characters in Controller/monitor UI.
- Updated the current authentication documentation to describe the Controller-led
  common wall without a dropdown, and deployment instructions to require all
  migrations through 0033 and the Edit branding flow.

Final verification:

- 27 unit/PDF suites and 17 PostgreSQL/server suites passed: all 44 current suites.
  The ownership suite includes 217 migration/readiness checks; management includes
  177 shared-client/branding/common-monitor checks. Tests exercise the actual
  standalone server using disposable databases and mocked provider transports.
- The separate LCD/Video Wall migration preservation test passed in a fresh
  disposable database. A read-only snapshot backup was restored to another
  disposable database and every row in all 37 public tables matched the source,
  including existing branding, client settings, accounts and monitoring keys.
- PDF text/privacy, pagination, margins and image-proportion checks passed using
  the bundled Python interpreter with pdfplumber/pypdf. First/last rendered pages
  of representative CMS, screen-details and WhatsApp exports were inspected.
- ESLint, production webpack build/TypeScript, standalone preparation and
  git diff --check passed. The reviewed build was restarted locally; health and
  login return 200, and signed-out Administration redirects to login.
- The two private photo bases remain readable (20 files total); their path/size/
  SHA-256 inventory is recorded privately under .server-runtime. Test uploads use
  isolated temporary directories.
- Earlier browser verification for the same tile implementation confirmed
  desktop/mobile light/dark layouts, centered full-card artwork, plain
  Administration, missing/broken-logo name fallbacks, keyboard selection and the
  Opening state. The review's code changes affect health readiness and corrected
  text, without changing that layout or permission flow.

The first PDF test attempt selected a system Python without pdfplumber; rerunning
with the bundled interpreter passed. The initial ownership failure was the stale
new-table exclusion described above; the final complete run is green.
The historical Miniflare/D1 auth.integration.mjs and the original-SQLite
migration-preservation CLI are not tests of this Node/PostgreSQL application;
auth.server.mjs and the PostgreSQL ownership/import suites cover those current
paths. The LCD and backup tests were run separately as described above.

Remaining items and verification limits:

- npm audit --omit=dev reports zero known production dependency vulnerabilities.
  The full audit reports seven moderate development-tool findings through
  minimatch/@typescript-eslint, with zero high/critical findings. npm's compatible
  automatic fix did not clear them; its unrelated updates were reverted and the
  original package lock preserved. Resolve through a separately verified tooling
  upgrade or compatible upstream fix; no forced framework/dependency overrides
  were introduced during this review.
- Real OnSign service access and Gmail/UltraMsg delivery were not exercised by the
  test suite. Target IIS/HTTPS, Windows service recovery, Docker runtime and actual
  OnSign player acceptance require their respective hosting/device environments.
  The local database restore does not validate an off-server scheduled backup
  service, and database backups do not include the private photo files.

No blocking functional regression remains in the reviewed/tested paths. Existing
Sephora operational data was not rewritten by review tests; backup/restore was
read-only against the source. Local runtime logs, backups, test outputs and actual
environment settings remain ignored by Git. No commit, push, production merge,
company-server migration or deployment was performed.


## Second pre-push pass - 13 November 2026

Rechecked the current working tree and traced additional failure paths through
branding/client creation, session validation, stale-tab protection, Controller
activation, photo cleanup, database transactions/pools and alert-worker scope.
No new blocking application defect was identified. The previously verified
production source/build remains unchanged during this second pass.

Expanded the client-management regression suite to force a database exception
on background INSERT/UPDATE after the logo write. This proved transaction-wide
rollback of the first asset and its audit event, controlled 503 responses and
non-disclosure of the internal database error. The same injected failure during
new-client creation proved rollback of the new identity, settings through their
foreign keys, management audit records and PostgreSQL runtime-role provisioning.
These triggers/functions exist only in a random disposable test database and are
removed before the rest of the suite runs. No live client branding is changed.

The expanded management suite passed all 185 checks. ESLint and diff whitespace
validation passed again. The prior complete run of 44 current unit/PDF/server
suites, plus independent backup/restore and LCD/Video Wall migration checks,
remains applicable; the only subsequent executable change is this added test
coverage. A private SHA-256 source manifest is saved under .server-runtime to
identify changes that would invalidate the reviewed state before a later push.

The seven moderate development-tool dependency advisories and unverified real
provider/target-hosting acceptance checks from the preceding review remain open.
No claim is made that tests prove the absence of every possible defect. The
reviewed local app remains available; no commit, push or deployment occurred.


## Compact responsive client grid - 13 November 2026

Reduced the client card size and top spacing in client-selection.css. Cards use
reserved grid slots and stay at or below 260 CSS pixels instead of expanding to
fill a sparse row. The shared content width is capped at 1660px. Browser checks
with 12 disposable tiles verified 6 columns at 1920px, 5 at 1536px, 4 at 1280px,
2 at 768px and 390px, and 1 at 320px. Additional clients wrap to later rows.
There was no horizontal overflow at those sizes. Phones use smaller square tiles;
Administration stays plain, and no-logo/broken-logo names remain centered and
readable in light and dark modes. Keyboard selection opens the correct client.

ESLint, the production webpack/TypeScript build, whitespace checks and all 185
management/branding/common-monitor regression assertions passed. The expanded
layout fixture and its extra clients were confined to a disposable database and
removed afterward. The updated build was restarted locally and returned health
200. This step changes only layout CSS; operational data, routes and permissions
are unchanged. No commit, push, production merge or deployment was performed.

## Final verification before GitHub push - 13 November 2026

Kept the approved client selection layout and heading unchanged. All 401 files
in the private source review manifest match the reviewed state. No application
code or dependency changes were required in this pass.

ESLint, diff whitespace checks and the production webpack/TypeScript build pass.
All 44 current unit/PDF/server suites pass against the newly completed build,
including all 185 management/branding/common-monitor assertions. The first run
had a PostgreSQL connection-termination error during screen-details test teardown
after all 23 assertions passed. Its isolated rerun and the complete fresh-build
run both exited cleanly. A separate confirmation attempted during the build was
invalid because the build was replacing standalone output; it was superseded by
the clean full run. No application fix was inferred from those test-run issues.

The independent LCD/Video Wall migration regression passes. A new read-only local
database snapshot restored exactly across all 37 public tables into a disposable
database. There are no pending local migrations; the Sephora inventory remains
3 countries, 5 regions, 9 stores, 18 screens and 2 groups. All 20 private photo
files are readable. Test databases were disposable; live branding/data were not
rewritten by review tests. Environment files, backups and uploads remain ignored.

The rebuilt local app was restarted: health and login return 200, signed-out
Administration redirects to login, and branding reads/writes require sign-in.
The local error log is empty. The unchanged responsive layout retains the prior
six-width browser verification. Production dependency audit reports zero known
vulnerabilities; the full audit still reports seven moderate development-tool
advisories and no high/critical advisories. Real external-provider delivery and
company hosting/device acceptance remain outside local test coverage.

No commit, push, production merge or deployment was performed.

## Additional source review - 13 November 2026

Reviewed the security and failure paths again through session/workspace resolution,
client management and branding, inventory updates/deletion, photo preparation and
cleanup, account mutations, CMS/PDF exports, monitor capabilities, per-client
provider caches/workers, PostgreSQL ownership/provisioning policies and deployment
startup/assets. No new blocking finding was identified and no application code
was changed. The approved client selection layout remains unchanged.

A source/configuration audit enumerated 297 files and all 38 API route files.
Every API route has a workspace wrapper; every exported mutation route has an
origin check in its module. TypeScript resolution found no unresolved local
imports, and the credential-pattern scan found no matching private key/common
access-token patterns. These mechanical checks support the manual critical-path
review; they do not prove that every branch or possible runtime failure is safe.

All 401 manifest files still match the state used by the clean 44-suite test run
and successful production build. No executable changes invalidate those results,
so the unchanged full suite/build was not needlessly repeated in this pass.
Whitespace checks pass. The previously documented seven moderate development-tool
advisories, transient test-teardown failure (superseded by clean reruns), and
unverified live-provider/company-hosting/device acceptance remain disclosed.
No commit, push or deployment was performed.

## Final OnSign and client action layout review - 16 November 2026

Reviewed the pending settings API, encryption, migration/setter permissions,
environment fallback, organization discovery, cache refresh and all affected
player/state/PDF callers, plus the responsive client action buttons. No blocking
finding was identified and no application changes were needed during this pass.
The preceding browser verification confirmed side-by-side 44px buttons on desktop,
stacking below 768px, correct dialogs for Sephora, and the empty-search table cell.
The application source has not changed since those browser checks.

Fresh ESLint, TypeScript and production build checks pass. All 46 active
unit/PDF/server suites pass, including 81 OnSign settings integration assertions
and 220 ownership/migration assertions. The independent LCD migration check passes.
The historical D1/Miniflare authentication and SQLite comparison scripts do not
apply to this PostgreSQL build; current authentication/import suites were run.
A fresh backup restored all 38 local tables exactly into a disposable database.
Before/after fingerprints also confirm all 38 original tables, 20 photos and
.env.local remain unchanged. OnSign overrides remain empty, preserving Sephora's
original server configuration. No configured credentials were found in 78 browser
JavaScript bundles. Production dependency audit: zero known vulnerabilities;
seven moderate development-tool advisories remain, with none high or critical.

Provider regression calls use mocks; real token/organization access still needs
the dashboard Test connection check. Preserve the original AUTH_SECRET with
database backups for encrypted tokens. Company server/database untouched.
No commit, push or deployment was performed.


## Per-client OnSign administration - 16 November 2026

Added an Admin-only OnSign API editor per client with organization ID, write-only
API token, read-only connection test, immediate save, disable and restoration of
server configuration. Blank token keeps the effective token; replacing a broken
encrypted token does not require decrypting it. Existing environment values and
Sephora inventory/settings are not rewritten. Other clients never inherit the
legacy Sephora token. Email, WhatsApp, branding and monitoring links are unchanged.

Migration 0034 adds an initially empty credential table and a bounded SECURITY DEFINER
setter with enabled-Admin authorization, a shared account-management
lock, expected-version conflicts and atomic secret-free audits. Runtime roles
cannot write the table directly; non-root client roles cannot read it. Tokens
use AES-256-GCM with fresh nonces, client-ID authentication and a purpose-derived
key from AUTH_SECRET. Preserve that secret with database backups. No token or
ciphertext is returned through settings GET responses or audit payloads.

OnSign runtime methods resolve one credential snapshot per call and separate
caches by client and credential identity. Rotation, disabling and fallback changes
apply without restarting, including across server processes. Unreadable tokens
fail closed rather than using cached/legacy credentials. The old picker hint now
points to Administration instead of incorrectly recommending Sephora's legacy
single-client environment variable.

Lint, TypeScript and production build pass. All 46 current unit/PDF/server suites
pass against the new build. The expanded dedicated settings suite additionally
passes 50 integration assertions with a local mocked provider: permissions/origin
checks, encrypted storage, no token disclosure, legacy/global and per-client JSON
fallbacks, same-client concurrent saves, runtime-role restrictions, forced audit
failure rollback, tampered credentials, immediate cache changes and preservation
of inventory/email settings. Encryption unit checks cover random nonces, wrong
keys, wrong clients and tampering. Real provider access is not exercised by these
fixtures; an Admin can use Test connection with a real token in the local app.

Browser checks verified testing/saving a disposable client's connection, blank
saved-token fields, Sephora environment fallback, light/dark desktop layout and
390px/320px phone layouts with scrolling and no horizontal dialog overflow.
Disposable browser fixtures/databases/roles were removed after verification.

Before local migration, a private PostgreSQL backup restored exactly across all
37 public tables. Applying 0034 locally preserved identical row counts and data
fingerprints across all 36 pre-existing non-migration tables, leaving OnSign
overrides empty. The local app was restarted and returns health 200; outgoing
email/WhatsApp workers are disabled for this local test process only. Company
server configuration and database have not been accessed or changed. No commit,
push or deployment was performed.

## OnSign settings review follow-up - 16 November 2026

Reviewed all OnSign settings changes, including the new migration/schema,
credential storage and encryption, Admin/origin authorization, strict input
validation, write concurrency, audit rollback, environment fallback precedence,
provider cache invalidation, downstream player/details/filter/PDF paths, editor
loading/error/secret handling and deployment/backup documentation.

Found and fixed an action-validation defect: coercing a JSON array such as
["test"] to a string let it pass the allowlist, while subsequent strict comparisons
could route it to saving. The endpoint now accepts only actual string actions.
Added five malformed-action cases and verification that no credential row is
created. No other blocking application defect was identified in this review.

Strengthened preservation coverage: the dedicated suite now seeds an existing
Sephora hierarchy/screen, notes, display selection, monitor capability and alert
recipients instead of comparing only an empty inventory. It verifies these and
branding/common-monitor settings remain identical through OnSign mutations.
Disabled Admin reads/writes are also rejected. The dedicated integration suite
passes all 66 assertions against the final build; the ownership/migration suite
passes 220 checks with populated legacy records.

All 46 current unit/PDF/server suites pass against the rebuilt application.
ESLint, standalone webpack build, TypeScript and whitespace checks pass. The
independent hardware migration and fresh local database backup/restore checks
also pass. One earlier CMS fixture failed account setup after an 888-second
pause, exceeding its ten-minute bootstrap expiry; it passed in four seconds on
the final fresh-fixture run. Historical Miniflare/SQLite suites are not applicable
to this PostgreSQL runtime; the active preservation/ownership/import tests pass.

Before and after review testing, fingerprints matched across all 38 local public
tables, all 20 private photo files and the exact .env.local bytes. The local OnSign
override table remains empty, retaining existing Sephora environment settings.
The latest backup restored all 38 tables exactly into a disposable database.
All 78 browser JavaScript bundles were scanned without finding configured
credentials. No company server or company database was accessed or modified.

Production dependency audit: zero known vulnerabilities. Full audit: seven
moderate development-tool advisories, zero high/critical. Real provider calls
remain mocked in tests; a real token/organization still needs Test connection.
AUTH_SECRET must be preserved with backups to decrypt dashboard tokens. An
in-flight read may finish with its captured credentials; later calls resolve the
new saved settings. No guarantee is made against every possible runtime failure.

The final build was restarted locally with outgoing email/WhatsApp workers
disabled for the local process only. No commit, push or deployment was performed.

## Load OnSign organizations - 16 November 2026

Added Load organizations to the per-client OnSign API editor. Admins can use a
newly entered token or the effective saved/server token to read all accessible
organization names/IDs, then explicitly select the correct organization. Selection
fills the ID field; no organization is automatically chosen and no credentials or
settings are saved by discovery. Manual IDs remain available. Editing a token
clears the previous result list, and unavailable current IDs remain visible.

Discovery uses the same authenticated, same-origin, version-checked endpoint,
a fixed read-only provider query, a shared five-second timeout, bounded pagination,
ID deduplication, name sorting and cursor-loop rejection. Only id/name DTOs are
returned with private no-store headers. Error details/tokens stay server-side.
No database migration or credential-storage change is required beyond 0034.

All 46 current unit/PDF/server suites pass, including 81 dedicated OnSign settings
checks. Lint, TypeScript, the production build and credential scan of 78 browser
JavaScript files pass. Browser verification used a disposable app and mocked
provider: paginated organization names appeared without an auto-selection,
choosing one filled its ID, Test connection succeeded, and changing the token
cleared old results. Desktop and 390px phone layouts fit, with vertical scrolling
on phones. No real provider credentials were used during browser verification.

A first concurrent suite/browser fixture run collided during cleanup because its
environment-client fixture used a fixed global PostgreSQL role. The fixture now
uses a random client ID/role per run; final suite cleanup passes. All original
local data fingerprints (38 tables), 20 photo files and .env.local bytes remain
identical before/after testing. Local app restarted with outgoing alert workers
disabled for the local process only. Company server untouched. No commit, push
or deployment was performed.

## Final combined OnSign review - 16 November 2026

Re-reviewed the complete OnSign settings and organization discovery diff,
including authorization/origin checks, request validation, encrypted token
handling, environment fallback, optimistic versions, SQL permissions/atomic
audits, read-only discovery/test operations, bounded pagination, runtime cache
isolation, player/filter/PDF callers and editor save/error/token behavior.
No new blocking finding was identified; no application code changed in this pass.

Fresh verification: all 46 active unit/PDF/server suites pass with no failures,
including 81 OnSign settings assertions and 220 ownership/migration checks.
ESLint, TypeScript, webpack production build and whitespace checks pass. The
independent LCD/Video Wall migration check also passes. A fresh local backup
restored all 38 tables exactly in a disposable database. Browser bundle scan of
78 JavaScript files found no configured credentials. The earlier desktop/mobile
browser checks still apply because the UI has not changed in this review.

Before/after fingerprints confirm all 38 local tables, all 20 photo files and
.env.local are unchanged by the review. OnSign overrides remain empty locally;
Sephora retains its original server fallback. Original client-integrations,
authentication and database-pool modules have no changes in this feature diff.
The company server/database were not accessed. The final build was restarted
locally with outgoing alert workers disabled for the local process only.

Remaining limits: provider API calls use mocks in regression tests, so real
credentials/access need the Admin Test connection check. Preserve AUTH_SECRET
with backups for encrypted dashboard tokens. Audit reports zero runtime
vulnerabilities and seven moderate development-tool advisories (no high/critical).
No commit, push or deployment was performed.

## Broader project review and malformed-action fix - 16 November 2026

Expanded review beyond the OnSign diff to authentication/session handling,
Admin/Controller authorization, origin checks, workspace cookies and PostgreSQL
roles, inventory mutations, monitoring capabilities, private photo paths and
uploads, CMS/report endpoints, preview persistence, alert-worker scoping and
Windows/standalone deployment paths. Static API references all resolve to routes;
no configured credentials or private environment/upload/runtime paths appear in
publishable source. This is a review and regression check, not a guarantee that
all possible bugs have been eliminated.

Found and fixed an input-validation defect in client-branding, client-logo,
screen-gallery and CMS support. String(action) allowed arrays such as ["keep"]
to pass action validation while strict downstream comparisons interpreted a
different operation. In branding/gallery this could remove an image through a
malformed Admin request; in CMS it could turn a malformed action into an update.
The normal dashboard submits strings. These routes now require string actions
before any mutation. A new disposable-database regression failed against the
previous build and passes after the fix. Additional assertions verify unchanged
image bytes, versions, files and audits when malformed requests are rejected.
No migration or stored-data rewrite was needed for this fix.

Fresh verification on the final source: all 46 active unit/PDF/server suites
passed, with 204 client-management, 67 private-photo and 74 CMS integration checks,
as well as the existing 81 OnSign and 220 ownership checks. Lint, TypeScript,
production build, whitespace checks and the independent LCD migration check
passed. A fresh backup restored all 38 tables exactly into a disposable database.
The before/after comparison verified all 38 local tables, 20 photo files and
.env.local unchanged. The browser bundle scan passed for 78 JavaScript files.
The responsive action layout source was unchanged from the verified desktop,
767/768px breakpoint and mobile browser checks.

No further blocking issue was identified in the reviewed scope. The current
lockfile and dependency audit are unchanged: no known production vulnerabilities,
seven moderate development-tool advisories, none high or critical. Real provider
permissions still need an Admin Test connection check; preserve AUTH_SECRET with
backups for encrypted tokens. Company server and database were untouched.
No commit, push or deployment was performed.
