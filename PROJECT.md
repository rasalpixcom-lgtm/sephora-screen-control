# Sephora Screen Control

Central screen inventory, remote wall controller, and view-only monitoring wall.

## Routes and access

| Route | Purpose | Intended account |
| --- | --- | --- |
| `/admin` | Dashboard and sidebar for screens, countries, regions, locations, groups, activity, access, and settings | Admin |
| `/controller` | Choose a country, then one of its regions, then a location and its screens; or choose a cross-store group; set rotation | Controller |
| `/monitor` | Display the selected live previews; fit a fixed-size grid to the wall display and rotate through additional pages | Dedicated wall device |

These are three routes in **one application**, connected to **one Cloudflare D1 database**. A controller change is saved to `display_state`; the wall reads that state every three seconds. Screens are loaded only for the visible wall page so a large inventory does not mount hundreds of iframes at once.

## Current deployment boundary

The hosted preview is **owner-private** through the Sites platform. It is suitable for design review and entering test data, but it is **not ready for wider staff or wall-device access**. The staff email/password login and separate admin, controller, and wall roles requested for production are not active. The Access page reports this honestly. Do not make the Site public or distribute an owner credential to a wall device.

The next production step is to connect a managed identity service, provision the first admin and a dedicated wall account, and enforce roles on every server route and API action. Supabase Auth is a proposed provider for email/password and password reset; using an existing Sephora identity provider would also work. The provider must be configured before implementation can be verified end to end. Never store staff passwords in this app or in the D1 database. Keep service credentials in hosted secrets, never in source or browser code.

After identity is active, test denied access for anonymous, wall, and controller accounts; admin CRUD and audit attribution; session expiry and password reset; and a wall-device restart. Only then expand the audience. The currently private Sites sign-in is not the requested staff login.

## Data and preview behavior

- Admin saves country → region → location → screen, plus groups containing screens from any location.
- Each screen may have an HTTPS OnSign preview URL. Empty links show a clear placeholder.
- A saved preview URL means only that a source is configured. It does **not** establish that the OnSign player is online. Player health requires an OnSign API or heartbeat integration.
- The preview appears in an iframe only if OnSign permits embedding on the deployment domain. Standard `https://app.onsign.tv/embed/…` links are framed in the wall card to hide the embed page's title and update timer while retaining the signage canvas. Other preview URLs keep their full frame. This framing depends on OnSign's current embed layout, so verify it again if OnSign changes that page.
- Inventory, group membership, shared wall selection, and recent activity persist in D1. Activity currently records changes but is not a compliance-grade immutable audit system.
- Sample items in the current database are labeled `Sample data`; remove or replace them before operational use. New empty databases start empty.

## Stack and local run

- React 19, Vinext/Next-compatible routes, TypeScript, and Shadcn UI primitives.
- Cloudflare Worker and D1 for server routes and storage.
- Responsive CSS with self-hosted Inter Variable across Admin, Controller, and Monitor. It has an Apple-like UI feel and stays consistent on Windows, iPad, and Mac. No proprietary Apple font files are bundled.
- Admin and Controller retain the simple task layout with larger readable labels and clear actions. Reference-inspired cards use rounded corners, thin borders, and subtle neutral gradients. Outfit Variable is bundled for rounded geometric typography, with Inter as fallback. Admin shows a compact current-wall summary, inventory counts with preview-link coverage inside the Screens card, and a prominent list of screens needing links. Controller and Monitor navigation stays in the sidebar. Controller keeps the wall summary above two areas: progressive location/group choices and screen selection. Location breadcrumbs let users change an earlier choice without scrolling through every level. The areas stack on smaller screens. Light mode uses soft gray surfaces; dark mode uses slate surfaces. The wall has Dark, Dim, and Soft light appearances saved locally on each display device. The application does not bundle a proprietary Sephora font or logo asset.

Install with `npm install`. Use `npm run dev -- --port 5174` for this project because ports **5000 and 5173** belong to other projects. `npx tsc --noEmit` checks types and `npm run build` creates the deployable Worker. D1 schema migrations are in `drizzle/`.

## Operating flow

1. Admin adds countries, regions, locations, and screens, then assigns each screen its OnSign preview URL.
2. Admin creates groups such as Cash table and assigns screens across locations.
3. The wall device opens `/monitor` in full screen.
4. A controller opens `/controller` on a laptop or tablet. In **By location**, the next level appears only after its parent is selected: country → region → location → screens. **Screen groups** is a separate choice for screens across stores. The wall reflects each saved selection within the polling interval.

### Theme contrast refinement

- Preserved the Outfit typography and charcoal/gray palette. Secondary labels and form hints use shared readable colors; preview badges have consistent 12px text and solid/dashed outlines. Selected cards have an outlined state, and keyboard focus uses a visible 2px ring.
- Checked text colors against the relevant solid surfaces and gradient endpoints: light secondary card text has a minimum ratio of 4.59:1, dark secondary card text 6.26:1, and revised light quiet text 4.60:1 on the tested page/control surfaces. Focus colors have a minimum ratio of 3.25:1 on the tested surfaces. These are targeted color checks, not a full accessibility certification.
- Visually checked light Controller selections, light Admin form hints and keyboard focus, and dark Admin preview badges.

### Controller and Monitor emerald preview

Controller dark mode and Monitor Dark appearance use near-black backgrounds (#0c1012), flat black cards (#111719), and restrained emerald accents (#39b88d). Controller light mode retains muted gray surfaces with a deeper green accent. Admin colors remain unchanged. Fonts, card shapes, hierarchy, live previews, and wall paging are preserved. Green denotes controls and selection; preview-link badges remain neutral and do not claim player health. Tested dark action text contrast is 7.08:1, secondary text on selected cards 7.58:1, and light action text 6.51:1.
