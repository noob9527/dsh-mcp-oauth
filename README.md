# DSH MCP OAuth

OAuth-protected MCP tools for an unmodified DeepSeek Harness installation. The plugin owns its MCP connections and uses the official tool registry, credential store, authorization service and plugin-page extension.

[中文](README.zh.md)

## Status and compatibility

Independent community plugin; not an official DeepSeek product. The npm 0.1.0 release supports local callbacks. Version 0.2.0-rc.2 adds remote personal-instance callbacks and manual response submission.

| Surface | Status |
| --- | --- |
| Official DSH 0.2.1-alpha.3 / 0.2.2-rc.1 Web, local macOS | Current candidate: browser CIMD OAuth and real chat tool calls verified |
| Official Desktop | Intended scope; acceptance pending |
| Other DSH versions | Not declared compatible |
| Remote personal DSH, 0.2.0-rc.2 | HTTPS proxy fixture verified; actual deployment acceptance required |
| Shared multi-user DSH | Not supported |

Version 0.2.0-rc.2 requires DSH `>=0.2.1-alpha.3`. All 13 published versions at or above this floor in the [17-version compatibility matrix](docs/compatibility.md) passed automated checks. Later versions are admitted by the range but are not automatically certified. Version 0.1.0 retains its original rc.2 requirement.

## Install from npm

Requires Node 24.9+ and an unmodified official DSH installation satisfying `>=0.2.1-alpha.3`. The public package name is `@noob9527/dsh-mcp-oauth`.

Version `0.2.0-rc.2` is under development and has not been published to npm. Install the published preview using `next`, or build the current source below. Use `latest` for the stable release.

Install the published preview:

```sh
dsh plugin --profile web add @noob9527/dsh-mcp-oauth@next
```

The unscoped `dsh-mcp-oauth` package is a different project. When migrating a local unscoped installation, remove its plugin entry before installing this package; do not enable both together. Use the same DSH profile and home to retain locally stored service settings and grants.

## Install from source

Requires Node **24.9+**, pnpm **12.5.1**, and an unmodified official DSH installation satisfying **`>=0.2.1-alpha.3`**. Clone this repository and run these commands from its directory:

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run typecheck
pnpm test
pnpm pack --pack-destination artifacts
dsh plugin --profile web add "$(pwd)/artifacts/noob9527-dsh-mcp-oauth-0.2.0-rc.2.tgz"
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
| Callback mode | Local automatic, remote HTTPS automatic, or manual response paste; remote automatic requires an administrator-configured proxy |
| Internal loopback listener port | Remote mode only; defaults to 6274, always bound to 127.0.0.1 |
| Callback URL | Defaults to `http://127.0.0.1/oauth/callback`; local mode chooses a free port when none is specified |
| Scopes | Optional space-separated scope names |

Automatic mode uses configured pre-registration first, then CIMD when configured and supported, then dynamic registration. Explicit CIMD fails when unsupported. The public CIMD document declares native-client callbacks at `http://127.0.0.1/oauth/callback` and `http://localhost/oauth/callback`. Local mode binds an OS-assigned port before authorization and uses that exact URL for authorization and token exchange. Explicitly configured ports remain fixed and report conflicts; existing settings are not migrated. Authorization servers must support native loopback port matching (RFC 8252). Remote HTTPS callbacks and manual responses retain exact matching.

Advanced defaults: connection timeout 30 seconds, sign-in timeout 5 minutes, tool deadline 10 minutes, refresh lead time 60 seconds, 5 reconnect attempts with a maximum delay of 30 seconds. Tool deadlines are total deadlines, not progress-reset timers.

For remote instances without a callback proxy, choose **Manual response paste**. After browser consent, paste the complete callback URL into the service’s pending-login form. No listener starts; PKCE, one-time state and registered redirect validation remain required. See [manual authorization](docs/manual-authorization.md).

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

### Host OAuth diagnostics

OAuth login and refresh failures emit a JSON `mcp_oauth_failure` record to Host stderr. Container operators should inspect the Host/container logs, not the chat transcript. Records contain a hashed service identifier, the failure stage, and up to six allowlisted error classifications, network codes and HTTP status numbers. Stages are `callback_setup`, `resource_challenge`, `discovery_and_registration`, `authorization_callback`, `token_exchange`, `credential_persistence` and `refresh`. The discovery stage includes SDK-managed registration. Unknown errors remain `UnknownError`; absence of a classified reason does not imply success. Proxy tunnel rejection status is extracted from recognized proxy error text without retaining the text.

Diagnostics omit raw messages, stacks, URLs, service labels, request/response bodies, headers, authorization codes, state and credentials. They are not returned in Client state or session events. UI error codes remain unchanged. A hashed identifier correlates failures but is not an access credential.

When adding a service, Service ID is blank under Advanced, with a placeholder generated from the display name. Saving uses the entered ID or, when blank, the generated ID. Clearing a manually entered ID restores automatic generation. Non-ASCII letters use Unicode code-point segments. Duplicate IDs are rejected; change the ID in Advanced. Saved services retain their existing, read-only ID when renamed.

New services prefill the [public client metadata document](https://noob9527.github.io/dsh-mcp-oauth/oauth/client-metadata.json) in **Advanced → Client metadata document URL**. You can edit or clear this value. Existing services retain their saved value, including an empty value. The hosted document supports both local hostnames with the `/oauth/callback` path and variable ports. Other callback paths or remote callbacks require a matching document.

Scopes appears under Advanced and defaults to empty for automatic discovery. Separate multiple scopes with spaces. Existing configured scopes remain unchanged.

The service form shows only Display name and MCP URL by default. All other configuration fields are under Advanced; expanding it does not change stored values. Validation errors in advanced fields expand that section automatically.

Each configuration field has a help button with a localized tooltip. Hover, focus with the keyboard or click to read its purpose; click outside or press Escape to dismiss it.
