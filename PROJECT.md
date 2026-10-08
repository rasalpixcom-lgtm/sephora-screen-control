# Sephora Screen Control

One application contains Admin, Controller, and Monitor, backed by Node.js and PostgreSQL.

## Access and operation

- Admin manages countries, regions, locations, screens, groups, users, and settings.
- Controller chooses the shared wall selection and rotation. Location choices progress through country → region → location → screens; groups combine screens across locations.
- Wall accounts can view Monitor only. Admin can open all three areas.
- Admin creates credentials directly. Login IDs use email format but do not require a real mailbox. Passwords are stored as salted scrypt hashes. There is no email authentication service.
- Staff sessions last eight hours; dedicated wall sessions last thirty days. Disabling an account, resetting its password, or revoking its sessions ends access.
- All monitors read the same saved wall selection every three seconds. Only the visible page loads previews.

## Preview limitations

An OnSign link confirms that a preview source is configured, not that the player is online. No device-status API is connected. OnSign must allow embedding on the final domain. Standard OnSign embeds are framed to hide the surrounding title and timer; recheck that framing if OnSign changes its page layout.

## Design

Admin and Controller use simple task layouts, shared near-black and emerald colors, soft gray light mode, and self-hosted Outfit typography with Inter fallback. Monitor retains fixed-size, left-aligned cards and device-specific appearance preferences. No proprietary Apple or Sephora font files are bundled.

## Deployment and verification

See [SERVER-DEPLOYMENT.md](SERVER-DEPLOYMENT.md) for Windows Server, PostgreSQL, IIS HTTPS proxy, backups, and first-admin setup. See [AUTHENTICATION.md](AUTHENTICATION.md) for role and login behavior.

The local migrated database preserves existing accounts and inventory. Sessions were intentionally not migrated, so users sign in again with their existing credentials. The previous Sites-hosted URL remains a separate, older Cloudflare deployment; it does not receive changes from this server runtime.

Company-server deployment still requires the company domain, TLS certificate, restricted service account, automatic service startup, and an operational backup plan. These cannot be verified without access to that server. Do not expose a development server or the PostgreSQL port publicly.
