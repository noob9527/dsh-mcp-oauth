# Publishing source and packages

## Publish the GitHub repository

The project uses MIT. Review the license holder and existing Git author information before public publication. Retaining commit history also publishes its author metadata; source hygiene does not remove that metadata.

1. Review `git status`, `git diff --check` and `git diff`; do not stage ignored evidence, credentials or generated packages.
2. Run the checks in CONTRIBUTING.md. Inspect the tarball file list and generated JavaScript.
3. Verify that `origin` points to the public `noob9527/dsh-mcp-oauth` GitHub repository and that package repository, homepage and issue links match it.
4. Review and commit the release changes, then push the intended branch. No script in this project performs these steps automatically.
5. Wait for the GitHub CI checks for that commit before publishing its package.
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
node scripts/check-release.mjs --tarball artifacts/noob9527-dsh-mcp-oauth-0.2.0.tgz
```

Manually create a GitHub prerelease and attach the reviewed tarball if preview distribution is desired. A source release and an npm release are distinct operations.

Publish release candidates under `next`, leaving the stable `latest` tag unchanged. Publish stable version 0.2.0 under `latest`.

The distribution target is the public npm registry under `@noob9527/dsh-mcp-oauth`. Package metadata fixes the registry and public access. Authenticate as an account permitted to publish under the `noob9527` scope; keep credentials outside this repository. Review the exact tarball with `npm publish ./artifacts/noob9527-dsh-mcp-oauth-0.2.0.tgz --dry-run`, then publish that same file with `npm publish ./artifacts/noob9527-dsh-mcp-oauth-0.2.0.tgz --access public --tag latest`. Verify the registry version and install the published package into a clean official DSH profile before announcing it. No workflow automatically publishes npm packages.

## Authentication and post-publication checks

Before publishing, check `npm config get registry` and `npm whoami --registry=https://registry.npmjs.org/`. The expected registry is `https://registry.npmjs.org/` and the account must have access to the package scope. A successful login alone does not satisfy npm's publishing authentication requirements. Complete the account's 2FA/browser verification when requested; do not put tokens, one-time codes or verification URLs in repository files or CI logs.

An exit code of zero can mean the upload was accepted while npm still processes the package. If the CLI reports processing and public lookup returns 404, wait and check again; do not repeatedly publish the same version. Confirm `npm view @noob9527/dsh-mcp-oauth@0.2.0 version dist.shasum --registry=https://registry.npmjs.org/`, compare the package digest, and install by registry package name in a clean official DSH profile. Only then mark registry installation as verified and remove any pending-availability notice from the READMEs and acceptance record.

Published name/version pairs cannot be overwritten. Repository documentation fixes after publication do not update the README bundled in that tarball; include them in a subsequent package version when needed. Keep the reviewed release tarball intact for digest comparison.

## Evidence limits

Local Web acceptance and the automated suite are recorded in acceptance.md. Desktop remains unqualified. Local screenshots, counters and tarballs under artifacts/ are intentionally ignored; review them before any separate upload. Do not publish URLs containing browser login tokens, callback codes or OAuth state.
