# Publishing source and packages

## Publish the GitHub repository

The project uses MIT. Review the license holder and existing Git author information before public publication. Retaining commit history also publishes its author metadata; source hygiene does not remove that metadata.

1. Review `git status`, `git diff --check` and `git diff`; do not stage ignored evidence, credentials or generated packages.
2. Run the checks in CONTRIBUTING.md. Inspect the tarball file list and generated JavaScript.
3. Create an empty repository in the intended GitHub account or organization. Use the repository name `dsh-mcp-oauth`; do not initialize a second README or license remotely.
4. Once its URL is known, add matching `repository`, `homepage` and `bugs` fields to package.json. No account URL is guessed in this repository.
5. Commit reviewed files, configure `origin` with the actual repository URL and push the intended branch. No script in this project performs these steps automatically.
6. Enable private vulnerability reporting. Choose a default branch and protect it with the CI checks after their first successful GitHub run. Review repository permissions and enabled Actions.

Suggested description: OAuth MCP tools for unmodified DeepSeek Harness, with PKCE, CIMD and credential refresh.

GitHub CI has read-only repository permissions and no model or registry secrets. It builds a tarball artifact; it does not publish Releases, tags or npm packages. Linux/macOS workflow execution is confirmed only by a real GitHub run, not by a local test result.

## Release a package

Before declaring a release, complete the intended platform acceptance matrix, verify the exact tarball on an unmodified supported DSH, update compatibility statements and turn the changelog preview into an accurately dated release entry. Choose the release version before packing; change the documented tarball names when the version changes.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check:release
pnpm run typecheck
pnpm test
pnpm pack --pack-destination artifacts
node scripts/check-release.mjs --tarball artifacts/dsh-mcp-oauth-0.1.0.tgz
```

Manually create a GitHub prerelease and attach the reviewed tarball if preview distribution is desired. A source release and an npm release are distinct operations.

The original distribution target is a private npm registry. Configure the registry and credentials locally or in the deployment environment; do not commit .npmrc or tokens. The unscoped package name requires a registry that supports unscoped private packages. npmjs private packages require a scope and coordinated package/module identifier changes. Public npm publishing requires a separate decision about name ownership and release readiness. No workflow automatically publishes to either registry type.

## Evidence limits

Local Web acceptance and the automated suite are recorded in acceptance.md. Desktop remains unqualified. Local screenshots, counters and tarballs under artifacts/ are intentionally ignored; review them before any separate upload. Do not publish URLs containing browser login tokens, callback codes or OAuth state.
