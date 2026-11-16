# Contributing

Use Node 24.9 or newer, pnpm 12.5.1, Git and OpenSSL with `req -addext`. Install dependencies with `pnpm install --frozen-lockfile --ignore-scripts`.

Before a pull request:

```sh
pnpm run check:release
pnpm run typecheck
pnpm test
pnpm run build
pnpm pack --pack-destination artifacts
node scripts/check-release.mjs --tarball artifacts/noob9527-dsh-mcp-oauth-0.1.0.tgz
```

Describe the user-visible behavior, relevant tests and compatibility impact. Add regression tests for changes to authorization, refresh, retries or teardown. Use loopback fixtures, atomic port allocation and explicit lifecycle cleanup. Do not weaken TLS verification, log credentials or silently retry tools with unknown outcomes.

Keep the plugin independent of DSH source workspaces and internal imports. Update both README languages for user-facing behavior changes. Do not broaden the supported DSH version without a packed-plugin installation test on the corresponding unmodified release.

Use reserved example domains and repository-owned fixtures. Do not commit organization-specific services, .env files, tokens, authorization codes, callback URLs containing state, credentials files, personal paths, or unreviewed recordings. See [SECURITY.md](SECURITY.md) for sensitive reports. The release check is a limited hygiene check, not a comprehensive secret scanner.

[Official-client acceptance](docs/acceptance.md) requires a local model key supplied outside the repository. Report browser, protocol and Desktop evidence separately. A PR does not need to publish a package or a GitHub Release.
