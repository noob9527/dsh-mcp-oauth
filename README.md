# DSH MCP OAuth

OAuth-protected MCP tools for an unmodified DeepSeek Harness installation. The plugin owns its MCP connections and uses the official tool registry, credential store, authorization service and plugin-page extension.

[中文](README.zh.md)

## Install

Target runtime: DSH **0.2.2-rc.2**, Node **24.9+**. Compatibility with other releases is not declared. Configure your private registry using your normal npm configuration; never commit registry credentials.

```sh
dsh plugin --profile web add dsh-mcp-oauth@0.1.0
```

For Desktop, install through its Plugins page into its own profile. The CLI Web profile and Desktop profile are separate. Restart if DSH reports that a restart is required.

Open **Plugins → OAuth MCP → Add service**. Enter the service URL and registration settings, save, click **Sign in**, then **Open authorization page**. Approve in the browser on the computer running DSH. The callback page only confirms receipt; the DSH page separately displays authorization and connection completion. Tools become available to normal chat once connected.

## Configuration

The initial service list is empty. A placeholder endpoint is `https://mcp.example.com/mcp`; it is not a live service.

| Setting | Meaning |
| --- | --- |
| Service ID | Stable lower-case identifier; namespaces tools and credentials |
| Registration mode | Automatic, CIMD, pre-registered or DCR |
| Client metadata document URL | Public HTTPS CIMD document maintained by the client operator |
| Client ID / secret | Pre-registered identity; the secret is stored separately |
| Callback URL | Defaults to `http://127.0.0.1:6274/oauth/callback`; must match permitted redirects |
| Scopes | Optional space-separated scope names |

Automatic mode uses configured pre-registration first, then CIMD when configured and supported, then dynamic registration. Explicit CIMD fails when unsupported. The plugin does not host a public CIMD document. Configure its redirect URI before login; the plugin does not silently select another port if the configured port is occupied.

Advanced defaults: connection timeout 30 seconds, sign-in timeout 5 minutes, tool deadline 10 minutes, refresh lead time 60 seconds, 5 reconnect attempts with a maximum delay of 30 seconds. Tool deadlines are total deadlines, not progress-reset timers.

## Credentials and lifecycle

Service configuration is stored in the active profile's `mcp-oauth/servers.json`. Grants are stored through DSH credentials, with keys derived from the canonical profile directory and service ID. The default DSH store is a local credential file, not an OS keychain. A service's URL, registration mode, client identity, scopes and callback bind its credentials; changing them requires new authorization.

Client secrets, access tokens and refresh tokens are not returned to the UI or written to service configuration. PKCE verifiers and state remain in memory during authorization. One running DSH process per profile is supported; concurrent processes sharing a profile are not a token-refresh coordination mechanism.

Disabling preserves authorization. Clearing authorization disconnects and deletes the local grant. Deleting removes both the configuration and its grant. These actions do not claim server-side revocation. Uninstalling the package leaves local persisted data; clear grants and delete services first if you want to remove that data.

Requests refresh an expiring token when possible. Concurrent refresh work is coalesced; a 401 permits one SDK authentication retry. Refresh alone does not interrupt accepted calls. Network failures and tool timeouts never cause automatic replay; an unknown outcome must be checked before manually repeating a state-changing tool.

Only local Web and Desktop are in scope. No remote-host browser callbacks, legacy SSE/stdio transports, MCP Tasks, resource browsing or prompt browsing are provided.

## Development and validation

```sh
pnpm install --ignore-scripts
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

## Private publication

Run validation and pack first. Publish only after registry configuration and release approval are available:

```sh
pnpm publish --registry "$NPM_REGISTRY_URL" --no-git-checks
```

This unscoped package requires a private registry that supports unscoped private packages. npmjs private packages require an organization scope and a corresponding package/module ID change. No registry, token or organization name is embedded in the package.
