# Sephora Screen Control

A central workspace with three routes:

- `/admin` manages countries, regions, stores, screens, HTTPS live links, and screen groups.
- `/controller` filters the network by hierarchy, group, or individual screens and saves the shared wall selection.
- `/monitor` is the view-only wall. It shows up to six feeds per page, rotates pages at the configured interval, and can be paused or made full screen locally.

The interface starts with clearly marked sample locations and screens. Their live links are blank. Edit or remove the examples before operational use.

## Architecture

- Vinext / React for the interface and API routes.
- Cloudflare D1 for durable screen inventory, group membership, and shared wall selection.
- The controller and wall refresh from the same API every three seconds. Only the visible wall page mounts feed frames, so hundreds of configured screens do not all load at once.
- All live links must use HTTPS. A link is embedded as an iframe and has an open-source fallback. OnSign must permit iframe embedding for the preview to appear.
- A configured preview source is **not** a player heartbeat. This version does not claim a screen is online or offline.

## Operating flow

1. In Admin, build the country → region → store → screen hierarchy, or edit the sample items.
2. Add the OnSign live link to each screen.
3. Create groups such as Cash table, then use Manage to assign screens across stores.
4. Open Monitoring on the large display.
5. Open Controller on a laptop or tablet. Selecting a country, region, store, group, or individual screens updates the wall automatically.

## Production recommendations

Before rolling out to the whole team, confirm the exact OnSign live-link format and whether its response allows framing on this domain. For actual device health, connect an OnSign status API or device heartbeat and show a separate online/offline status with a last-seen timestamp. Set role-based access for administrators and controllers, define the sharing policy for the monitoring wall, and add an audit trail for changes. At larger scale, cursor-based inventory loading and a push channel can replace three-second polling.
