# Sephora Screen Control

Central screen inventory, remote wall controller, and view-only monitoring wall.

## Routes and access

| Route | Purpose | Intended account |
| --- | --- | --- |
| `/admin` | Dashboard and sidebar for screens, countries, regions, locations, groups, activity, access, and settings | Admin |
| `/controller` | Choose the country, region, location, group, or screens shown on the wall; set rotation | Controller |
| `/monitor` | Display the selected live previews; rotate through up to six cards per page | Dedicated wall device |

These are three routes in **one application**, connected to **one Cloudflare D1 database**. A controller change is saved to `display_state`; the wall reads that state every three seconds. Screens are loaded only for the visible wall page so a large inventory does not mount hundreds of iframes at once.

## Current deployment boundary

The hosted preview is **owner-private** through the Sites platform. It is suitable for design review and entering test data, but it is **not ready for wider staff or wall-device access**. The staff email/password login and separate admin, controller, and wall roles requested for production are not active. The Access page reports this honestly. Do not make the Site public or distribute an owner credential to a wall device.

The next production step is to connect a managed identity service, provision the first admin and a dedicated wall account, and enforce roles on every server route and API action. Supabase Auth is a proposed provider for email/password and password reset; using an existing Sephora identity provider would also work. The provider must be configured before implementation can be verified end to end. Never store staff passwords in this app or in the D1 database. Keep service credentials in hosted secrets, never in source or browser code.

After identity is active, test denied access for anonymous, wall, and controller accounts; admin CRUD and audit attribution; session expiry and password reset; and a wall-device restart. Only then expand the audience. The currently private Sites sign-in is not the requested staff login.

## Data and preview behavior

- Admin saves country → region → location → screen, plus groups containing screens from any location.
- Each screen may have an HTTPS OnSign preview URL. Empty links show a clear placeholder.
- A saved preview URL means only that a source is configured. It does **not** establish that the OnSign player is online. Player health requires an OnSign API or heartbeat integration.
- The preview appears in an iframe only if OnSign permits embedding on the deployment domain. Confirm the actual link format and iframe behavior with a real link before rollout.
- Inventory, group membership, shared wall selection, and recent activity persist in D1. Activity currently records changes but is not a compliance-grade immutable audit system.
- Sample items in the current database are labeled `Sample data`; remove or replace them before operational use. New empty databases start empty.

## Stack and local run

- React 19, Vinext/Next-compatible routes, TypeScript, and Shadcn UI primitives.
- Cloudflare Worker and D1 for server routes and storage.
- Responsive CSS with system UI fonts (San Francisco on Apple devices where available).

Install with `npm install`. Use `npm run dev -- --port 5174` for this project because ports **5000 and 5173** belong to other projects. `npx tsc --noEmit` checks types and `npm run build` creates the deployable Worker. D1 schema migrations are in `drizzle/`.

## Operating flow

1. Admin adds countries, regions, locations, and screens, then assigns each screen its OnSign preview URL.
2. Admin creates groups such as Cash table and assigns screens across locations.
3. The wall device opens `/monitor` in full screen.
4. A controller opens `/controller` on a laptop or tablet and changes the shared selection. The wall reflects it within the polling interval.
