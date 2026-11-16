# Manual authorization response

[中文](manual-authorization.zh.md)

Available in the unreleased 0.2.0-rc.1 build. npm 0.1.0 does not include this mode. Use it when a personal DSH instance cannot receive automatic callbacks. Local and remote automatic modes remain available. Shared multi-user Hosts are unsupported.

## Choose a callback

Manual mode opens no listening port and needs no callback reverse proxy. It still uses Authorization Code + PKCE S256, the configured redirect URI and a one-time state. It is an alternate response delivery mechanism, not a new OAuth grant or token import feature.

Register one of these exact callback URLs in the CIMD document or pre-registered client:

- A trusted HTTPS response display page, for example `https://callback.example.com/oauth/response`. Its operator must prevent query logging, third-party scripts, analytics and response persistence. A page may display or copy the complete callback URL; it must not exchange codes for tokens. This plugin does not deploy such a page.
- An HTTP loopback URL with an explicit port/path, for example `http://127.0.0.1:6274/oauth/callback`. The browser may show a connection error after consent because no receiver is running on your computer. Copy the complete address bar anyway. Choose a port not used by another local application, which would otherwise receive the authorization response.

The authorization server must allow the selected callback. A successful consent page alone is not a completed plugin login. Remote DSH must be accessed over authenticated HTTPS, and each person must have a separate Host process, profile and credential store.

## Sign in

1. Open Plugins → Built-in plugin settings → OAuth MCP → Add service or Edit.
2. Select **Manual response paste** under Callback mode. Set the MCP endpoint, registration mode, client metadata URL or pre-registered identity, scopes and registered callback URL. The internal listener port is unused in this mode.
3. Save, select Sign in, and open the authorization page. Approve only the login you just started.
4. Copy the full final callback URL, including `code`, `state` and `iss` when present. Do not copy the initial authorization URL, a success message, an access token or a bare code.
5. Return to the same service's pending login in DSH. Paste into **Full authorization callback URL** and select **Submit authorization response**. Never paste it into chat or send it to another person.
6. The field clears when submitted. “Response received” acknowledges delivery only. Wait until DSH displays Authorized and Connected and discovers the tools.

The input is masked, is not stored in browser local storage and belongs to one pending attempt. Cancellation, completion, expiry or leaving the settings page removes it. The backend exchanges the code using its in-memory verifier and saves only the grant through the existing credential store. The form clears on rejected submissions too; paste the corrected response again if the attempt is still pending.

## Validation and recovery

The plugin parses the submitted URL without fetching it. It verifies the exact configured origin/path, absence of user information and fragments, one-time matching state, single-valued response parameters, and the discovered issuer when an `iss` parameter is supplied. A response must contain either a nonempty code or an OAuth error. Duplicate parameters, token parameters, arbitrary extra parameters and responses longer than 16,384 characters are rejected. Standard `error_description` and `error_uri` fields are accepted but never echoed or followed.

Malformed or mismatched responses leave the current attempt pending. A valid code or denial consumes the response once; repeated submission fails. Cancellation, timeout, disabling/removing the service, clearing authorization or unloading the plugin invalidates pending submissions. Restarting the process loses pending state and verifiers; start a fresh login. A response from an earlier attempt or another service cannot complete the new login.

If code exchange fails because the authorization code expired or was already used, start a new login rather than resubmitting it. Existing refresh and connection behavior is unchanged. Manual input is required only for interactive authorization; successful refresh does not require another paste.

## Sensitive data handling

Submission uses the plugin's owner-only direct Remote API, not chat, a model tool or a session command. The API returns no submitted URL or code, and errors use fixed codes. Automated tests verify rejection of non-owner requests and absence of submitted codes from returned state, saved configuration, grant records and captured logs. The inspected official unary Remote dispatch does not log the request arguments; this does not certify additional deployment diagnostics.

Do not record request bodies for `mcpOAuth/submitResponse` in gateway diagnostics, custom tracing or debugging middleware. The clipboard, browser history and the destination page can contain the response until cleared; the plugin does not erase those surfaces. Never record authorization URLs or callback parameters in repository files, screenshots, issue reports or analytics. This repository uses reserved domains and local fixtures only.
