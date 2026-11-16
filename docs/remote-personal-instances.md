# Remote personal instances

[中文](remote-personal-instances.zh.md)

Remote callbacks require the unreleased 0.2.0-rc.1 build or later; npm 0.1.0 supports local callbacks only. Install a reviewed tarball until a remote-capable release is published. This mode does not modify official DSH.

If no callback proxy can be configured, use [manual authorization response](manual-authorization.md). The proxy requirements below apply only to remote automatic callbacks.

## Deployment requirements

Each person must have a dedicated DSH Host process, profile directory and credential store. The authenticated DSH Web connection must represent that instance's owner. A URL prefix alone does not establish isolation. Shared multi-user Hosts, multiple replicas of one instance and shared credential files are unsupported. Do not broaden the plugin's owner-only Remote API policy to work around access failures.

Use a fixed HTTPS callback such as `https://dsh.example.com/u/alice/oauth/mcp/callback`. An administrator routes exactly this path to the plugin's HTTP receiver on `127.0.0.1:6274`. The proxy must run on the same machine/network namespace as the DSH process. In Kubernetes, use a proxy sidecar in the same pod; a separate pod cannot reach this loopback listener. The plugin never listens on all interfaces. Other services in the same network namespace must be trusted.

The callback listener exists only during sign-in. A 502 before sign-in or after completion is expected. One login at a time can use a given port. Separate processes on the same host network need different ports; separate pod network namespaces can reuse the same port. Occupied ports produce an error rather than choosing a different callback silently.

## Proxy routing

This Nginx fragment belongs in an existing HTTPS virtual host with a valid certificate. It preserves the complete path and supplies the configured external Host explicitly; it does not expose DSH's application routes anonymously.

```nginx
location = /u/alice/oauth/mcp/callback {
    proxy_pass http://127.0.0.1:6274;
    proxy_set_header Host dsh.example.com;
    proxy_set_header X-Forwarded-Host "";
    proxy_set_header X-Forwarded-Proto "";
    proxy_cache off;
    access_log off;
}
```

The plugin validates Host and path against the configured HTTPS callback URL and ignores forwarded headers. Preserve query parameters for the OAuth response. If the public URL has a non-default port, include that port in the forwarded Host. Do not rewrite the user-specific path into a shared callback path or derive upstream selection from query parameters. A shared outer ingress must route each user's callback to the correct personal instance.

The browser must be able to reach the HTTPS callback, including any required VPN. The authorization server fetches the CIMD document; it does not make the browser callback request. A callback can be reachable without the DSH Web session cookie: its one-time state and PKCE bind the response to a pending owner-initiated login. If the gateway authenticates callback requests, ensure it preserves the response query through login. Any anonymous exception must cover only the exact callback location, never the whole DSH instance.

Exclude OAuth callback queries, authorization codes and state from access/error logs, tracing and analytics at every proxy layer. The example disables access logging only for this location; configure other diagnostics to omit raw requests. Callback responses use `no-store`, `no-referrer` and a restrictive content security policy, with no third-party resources or echoed response parameters.

## CIMD document and plugin settings

Host an HTTPS metadata document reachable by the authorization server. A separate document per instance makes its callback list explicit. A shared document is also possible if every exact callback is maintained in its list; do not use wildcard redirect URLs.

```json
{
  "client_id": "https://metadata.example.com/oauth/dsh/alice.json",
  "client_name": "DSH MCP OAuth",
  "redirect_uris": ["https://dsh.example.com/u/alice/oauth/mcp/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "token_endpoint_auth_method": "none"
}
```

In Plugins → Built-in plugin settings → OAuth MCP → Add service:

- Select **Remote personal instance** under Callback mode.
- Set **OAuth callback URL** to the exact public HTTPS URL in the document.
- Set **Internal loopback listener port** to the proxy upstream port, for example `6274`.
- Select CIMD and enter the metadata document URL; leave the pre-registered client ID and secret empty.
- Configure the MCP endpoint and any required scopes, save, then select Sign in and open the authorization page in your own browser.

The browser returns to the remote callback. The instance validates the pending response, exchanges the authorization code using its in-memory PKCE verifier, stores the grant in its credential store, then connects to MCP. The callback page acknowledges receipt only; confirm Authorized and Connected in DSH before using tools. Tokens and PKCE verifiers do not pass through the settings UI.

## Recovery and compatibility

Invalid state, duplicate parameters, incorrect Host/path and repeated responses are rejected. Rejection does not authorize a different instance. Cancel, timeout, disable, grant clearing and plugin shutdown release the listener. Process restarts discard pending state and verifiers; start a new login. Persisted grants remain usable after restart when their existing identity binding matches. Changing the external callback URL requires reauthorization; changing only the internal port does not change the OAuth identity.

Old service configurations default to local mode. Local callbacks continue to use the port in their HTTP redirect URL. Remote mode uses the separate internal port and requires a dedicated HTTPS path. Save a backup of profile configuration outside the repository before upgrading: an older plugin's strict parser cannot read the new callback fields after they are saved. Do not downgrade without restoring compatible configuration.

## Validation

The automated HTTPS ingress fixture uses a per-run certificate and explicit client CA trust without disabling TLS verification. It covers CIMD document fetch, PKCE exchange, callback rejection, cancellation/timeouts, refresh and restarted grant reuse followed by an MCP search. Local fixture success does not certify an organization's ingress, owner-session mapping or real authorization server. Before deployment, verify these through the real DSH UI and check that a callback for one instance cannot complete another instance's login.

Deployment URLs, ingress manifests with private hostnames, credentials and live test evidence belong outside this public repository. Examples here use reserved domains only.
