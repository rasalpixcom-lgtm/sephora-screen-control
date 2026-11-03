# Branch and release workflow

- Make project changes on `main` and verify them before pushing.
- Push changes to `main` first when the user requests a push.
- Treat `production` as the release branch used by the company server.
- Merge verified changes from `main` into `production` and push that branch only when the user authorizes a production release.
- Do not push directly to `production` during routine development or update the company server without release authorization.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
