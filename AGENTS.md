# Branch and release workflow

- Make project changes on `main` and verify them before pushing.
- Push changes to `main` first when the user requests a push.
- Treat `production` as the release branch used by the company server.
- Merge verified changes from `main` into `production` and push that branch only when the user authorizes a production release.
- Do not push directly to `production` during routine development or update the company server without release authorization.
