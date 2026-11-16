# DSH MCP OAuth

OAuth-protected MCP tools for an unmodified DeepSeek Harness installation. The plugin owns its MCP connections and uses the official tool registry, credential store, authorization service and plugin-page extension.

[中文](README.zh.md)

## Status and compatibility

Independent community plugin; not an official DeepSeek product. The npm 0.1.0 release supports local callbacks. The current 0.2.0-rc.1 development build adds remote personal-instance callbacks and is not yet published.

| Surface | Status |
| --- | --- |
| Official DSH 0.2.2-rc.2 Web, local macOS | Browser OAuth and real chat tool calls verified |
| Official Desktop | Intended scope; acceptance pending |
| Other DSH versions | Not declared compatible |
| Remote personal DSH, 0.2.0-rc.1 | HTTPS proxy fixture verified; actual deployment acceptance required |
| Shared multi-user DSH | Not supported |

The source candidate additionally verifies DSH `0.2.2-rc.3`; the published 0.1.0 package remains rc.2-only until a new release. See the [17-version compatibility matrix](docs/compatibility.md) for the minimum version, exact coverage and reproduction command.

## Install from npm

Requires Node 24.9+ and an unmodified official DSH 0.2.2-rc.2 installation. The public package name is `@noob9527/dsh-mcp-oauth`.

Version 0.1.0 is available on the public npm registry. Installation by package name into a clean official DSH profile was verified on 2026-11-16.

Install the preview release:

```sh
dsh plugin --profile web add @noob9527/dsh-mcp-oauth@0.1.0
```

The unscoped `dsh-mcp-oauth` package is a different project. When migrating a local unscoped installation, remove its plugin entry before installing this package; do not enable both together. Use the same DSH profile and home to retain locally stored service settings and grants.

## Install from source

Requires Node **24.9+**, pnpm **12.5.1**, and an unmodified official DSH **0.2.2-rc.2** installation. Clone this repository and run these commands from its directory:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run typecheck
pnpm test
pnpm pack --pack-destination artifacts
dsh plugin --profile web add "$(pwd)/artifacts/noob9527-dsh-mcp-oauth-0.2.0-rc.1.tgz"
```

Tests require OpenSSL supporting `req -addext`. No model API key or business MCP endpoint is needed for automated tests. Restart DSH when prompted. If DSH uses a custom `DSH_HOME`, use the same value for plugin installation and startup. For npm installation, check `npm config get registry` if the package cannot be resolved; the public registry is `https://registry.npmjs.org/`.

Desktop has a separate profile; installation and OAuth behavior there are not yet qualified.

## Sign in

Open **Plugins → Built-in plugin settings → OAuth MCP → Add service** (the current public DSH slot places this settings entry in that group). Enter the service URL and registration settings, save, click **Sign in**, then **Open authorization page**. For local mode, approve in the browser on the computer running DSH. For remote mode, open the link in your own browser after the administrator configures the HTTPS callback. The callback page only confirms receipt; the DSH page separately displays authorization and connection completion. Tools become available to normal chat once connected.

## Configuration

The initial service list is empty. A placeholder endpoint is `https://mcp.example.com/mcp`; it is not a live service.

| Setting | Meaning |
| --- | --- |
| Service ID | Stable lower-case identifier; namespaces tools and credentials |
| Registration mode | Automatic, CIMD, pre-registered or DCR |
| Client metadata document URL | Public HTTPS CIMD document maintained by the client operator |
| Client ID / secret | Pre-registered identity; the secret is stored separately |
| Deployment | Local or remote personal instance; remote mode requires an administrator-configured HTTPS proxy |
| Internal loopback listener port | Remote mode only; defaults to 6274, always bound to 127.0.0.1 |
| Callback URL | Defaults to `http://127.0.0.1:6274/oauth/callback`; must match permitted redirects |
| Scopes | Optional space-separated scope names |

Automatic mode uses configured pre-registration first, then CIMD when configured and supported, then dynamic registration. Explicit CIMD fails when unsupported. The plugin does not host a public CIMD document. Configure its redirect URI before login; the plugin does not silently select another port if the configured port is occupied.

Advanced defaults: connection timeout 30 seconds, sign-in timeout 5 minutes, tool deadline 10 minutes, refresh lead time 60 seconds, 5 reconnect attempts with a maximum delay of 30 seconds. Tool deadlines are total deadlines, not progress-reset timers.

## Credentials and lifecycle

Service configuration is stored in the active profile's `mcp-oauth/servers.json`. Grants are stored through DSH credentials, with keys derived from the canonical profile directory and service ID. The default DSH store is a local credential file, not an OS keychain. A service's URL, registration mode, client identity, scopes and callback bind its credentials; changing them requires new authorization.

Client secrets, access tokens and refresh tokens are not returned to the UI or written to service configuration. PKCE verifiers and state remain in memory during authorization. One running DSH process per profile is supported; concurrent processes sharing a profile are not a token-refresh coordination mechanism.

Disabling preserves authorization. Clearing authorization disconnects and deletes the local grant. Deleting removes both the configuration and its grant. These actions do not claim server-side revocation. Uninstalling the package leaves local persisted data; clear grants and delete services first if you want to remove that data.

Requests refresh an expiring token when possible. Concurrent refresh work is coalesced; a 401 permits one SDK authentication retry. Refresh alone does not interrupt accepted calls. Network failures and tool timeouts never cause automatic replay; an unknown outcome must be checked before manually repeating a state-changing tool.

Local instances and remote personal Web instances are in scope. Shared multi-user Hosts, legacy SSE/stdio transports, MCP Tasks, resource browsing and prompt browsing are unsupported. See [remote deployment](docs/remote-personal-instances.md) for proxy routing, CIMD documents, isolation requirements and downgrade precautions.

## Upgrade and uninstall

Install a supported release with `dsh plugin --profile web add @noob9527/dsh-mcp-oauth@<version>`, then restart DSH. Check that release's DSH compatibility before upgrading.

To uninstall, run `dsh plugin --profile web remove @noob9527/dsh-mcp-oauth` and restart DSH. If you want to remove saved service settings and grants, delete the services in the plugin settings before uninstalling. Keep the same `DSH_HOME` for these commands.

## Development and validation

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run typecheck
pnpm test
pnpm run build
pnpm pack
pnpm exec tsx tests/serve-fixture.ts
```

Tests run deterministic OAuth/MCP and HTTPS metadata servers on loopback. CIMD authorization fetches and validates the actual metadata document, including client identity and redirect URI, before consent. OpenSSL generates a temporary per-run certificate trusted only by the test authorization server; TLS verification remains enabled. Run `pnpm exec tsx tests/serve-cimd.ts` for browser acceptance. This local test does not certify public hosting or a third-party authorization server.

See [acceptance](docs/acceptance.md) for the official-client workflow and current verification status. Protocol tests are not a substitute for actual chat invocation.

## Troubleshooting

- `OAUTH_CALLBACK_UNAVAILABLE`: free the configured loopback port, or configure a different redirect permitted by your client metadata.
- `OAUTH_CIMD_UNSUPPORTED`: choose a registration method supported by the authorization server.
- `OAUTH_ISSUER_CHANGED`: verify the server's issuer and clear the old authorization before logging in again.
- `OAUTH_LOGIN_REQUIRED`: refresh is unavailable or rejected; sign in again.
- `MCP_CALL_OUTCOME_UNKNOWN`: inspect the operation on the server before retrying it.
- `OAUTH_CONFIG_UNREADABLE`: repair the profile configuration file; the plugin does not discard unreadable configuration.

## Contributing and releases

See [CONTRIBUTING.md](CONTRIBUTING.md) for development, [SECURITY.md](SECURITY.md) for sensitive reports, and [the release guide](docs/releasing.md) for publishing source or packages. GitHub CI checks, tests and builds the project without model credentials; a green CI run does not replace Desktop or real-chat acceptance.

Authentication recovery failure withdraws the affected service’s tools and requires sign-in. A lost response or timeout reports an unknown outcome and never automatically replays tools/call; reconnect only reinitializes the connection and discovers tools. Closing a connection rejects new calls and drains admitted work. See the [failure acceptance matrix](docs/acceptance.md#high--and-medium-priority-failure-acceptance) for automated versus browser evidence.

## License

[MIT](LICENSE). Dependencies retain their own licenses.
