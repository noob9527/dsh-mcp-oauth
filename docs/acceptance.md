# Official-client acceptance

Use an isolated `DSH_HOME` and an unmodified npm installation of DSH 0.2.2-rc.2. Never use source overlays or workspace links as release evidence.

1. Run `pnpm pack`, then install the tarball with `dsh plugin --profile web add /absolute/path/to/noob9527-dsh-mcp-oauth-0.2.0-rc.1.tgz`.
2. Run `dsh web --no-open --port 3097` with the same isolated home. Open the exact URL printed by DSH; its local login token must not be recorded in screenshots or documentation.
3. Run `pnpm exec tsx tests/serve-fixture.ts`. Add its printed MCP endpoint in Plugins → OAuth MCP, use DCR and a free permitted loopback callback port.
4. Sign in, open the authorization page and approve. Verify that authorization succeeds, the connection becomes connected and two tools are listed.
5. Configure model credentials through DSH's own UI. Start a chat asking it to call the configured search tool with query `oauth`. Verify the tool card contains `document-1`; do not substitute a terminal SDK call for this step.
6. Restart DSH and verify another chat call succeeds without browser authorization.
7. Check cancellation, disabled state, clear authorization, failed login and disconnected state. Inspect light/dark themes and a narrow window.
8. Repeat installation and the interaction in the official Desktop app's separate profile.

The fixture contains no business environment or personal data. Do not record browser address bars containing authorization codes, access tokens or callback state. Actual model credentials must remain outside this repository.

## Evidence status

The automated protocol suite and actual client acceptance are separate evidence categories. The implementation session records executed checks in its delivery report; unexecuted model, Desktop and visual checks must not be described as passed.

## Scoped package installation

On 2026-11-16, the packed `@noob9527/dsh-mcp-oauth@0.1.0` was installed through the official DSH plugin command into a new isolated home. The Web plugin list displayed the scoped package as enabled, and OAuth MCP settings loaded the empty service list through the Host API. The 47 automated tests and typecheck passed after the package and Host/Client identifiers changed.

Public npm availability was subsequently verified on 2026-11-16: `latest` resolved to 0.1.0, the registry SHA-1 matched the uploaded tarball (`7d358ef005c083be399cccd2325488797e5b0f85`), and installation by scoped package name into a new isolated official DSH Web profile succeeded. The settings-page check used the local tarball; the registry check verified package installation. Earlier records below retain their original artifact names; they do not claim that every scenario was rerun on the scoped release artifact.

## Local CIMD Web acceptance

Run `pnpm exec tsx tests/serve-cimd.ts` (requires OpenSSL with `req -addext` support). The command prints an MCP URL, HTTPS metadata document URL, loopback callback URL and read-only audit URL. Set `CIMD_CALLBACK_URL` before starting if the default callback port is unavailable. Use those exact values in Plugins → OAuth MCP → Add service, with a new service ID and explicit CIMD mode. Leave the pre-registered client ID and secret empty.

The metadata host owns a temporary certificate and key. Only the fixture authorization server trusts that certificate. Neither DSH nor the browser needs a trust override: the authorization server fetches the HTTPS document. The test server pins the permitted document URL, allowing its owned loopback endpoint only; it is not a production SSRF policy implementation. No global certificate store or TLS verification flag is changed.

Sign in, open the authorization page, approve, and wait for Authorized / Connected / Tools: 2. Ask the real DSH chat to invoke `mcp__cimd-test__search` once with query `cimd-e2e` (use service ID `cimd-test`). Inspect both the tool card and the audit endpoint. The audit endpoint exposes counters only, never tokens or authorization codes.

Observed on 2026-11-16 in the unmodified official DSH 0.2.2-rc.2 Web client, with installed plugin build6 tarball:

| Evidence | Observed |
| --- | --- |
| HTTPS metadata retrieval / validation | 1 / 1 |
| Authorization / authorization-code token exchange | 1 / 1 |
| DCR registration | 0 |
| Actual chat tool calls | 1 |
| Tool input | query = cimd-e2e |
| Tool output | document-1; OAuth MCP test document; query = cimd-e2e |

This exercises discovery, explicit CIMD client selection, actual HTTPS metadata retrieval and validation, browser consent, PKCE code exchange, authenticated MCP discovery and real-model tool execution. The document and authorization server are repository-owned test fixtures, not public hosting or a third-party identity provider. No production plugin code was changed for this CIMD verification; later uninstalled lifecycle changes are outside this browser evidence. Desktop CIMD acceptance remains pending.

The automated suite also rejects a metadata document with a mismatched client_id or redirect URI before consent and token exchange. Typechecking and all 18 tests passed after these fixture changes. The fixtures keep token state in memory: restarting the fixture requires fresh authorization.

## CIMD expiry, long call and process restart

Run `CIMD_TOKEN_SECONDS=10 CIMD_CALLBACK_URL=http://127.0.0.1:16277/oauth/callback pnpm exec tsx tests/serve-cimd.ts`. Add a separate `cimd-lifecycle` service in the official Web client using the printed endpoints and explicit CIMD mode. Set Advanced → Refresh lead time to 0 ms so this test exercises actual expiry rather than the default 60-second early refresh. This is a test setting, not a recommended production default.

Complete browser authorization once. From actual DSH chat call `mcp__cimd-lifecycle__delayed_echo` with message `cimd-long-survived-expiry` and delayMs 20000. Then call `mcp__cimd-lifecycle__search` with query `cimd-after-expiry`. Stop the DSH process and wait for it to exit; keep the fixture process alive. Start the same official DSH installation with the same DSH_HOME, reopen the newly printed Web login URL and call search with query `cimd-after-process-restart`. Do not sign in to the MCP service again.

Observed on 2026-11-16 with official DSH 0.2.2-rc.2 and installed plugin build6 (no product-code changes for this test):

| Stage | Refresh count | Tool execution count | Result |
| --- | --- | --- | --- |
| Initial authorization | 0 | 0 | Connected, two tools |
| Long tool completed | 1 | 1 | cimd-long-survived-expiry |
| Search after expiry | 2 | 2 | document-1, query cimd-after-expiry |
| DSH process restarted | 3 | 2 | Credentials loaded, automatic refresh |
| Chat search after restart | 4 | 3 | document-1, query cimd-after-process-restart |

The long call ran for 20,001 ms. Its bearer token expired 9,991 ms after acceptance; the result completed 10,010 ms after expiry. Refresh count remained 1 throughout that call, so refreshing did not interrupt or replay it. Each of the three requested tools executed once. Browser authorization and authorization-code exchange counts remained 1; metadata retrieval remained 1; DCR registration remained 0. The fourth refresh occurred because the short token issued during startup expired before the next chat call.

The fixture rotates and invalidates each consumed refresh token. Successful refresh after a real process restart therefore verifies that the rotated refresh token was persisted and reused. This verifies request-time expiry handling; it does not claim periodic background refresh or require every server to continue an accepted call after token expiry. The fixture deliberately allows accepted work to complete.

Evidence is stored locally in ignored `artifacts/evidence/cimd-lifecycle-*.json`, `dsh-cimd-long-call.png` and `dsh-cimd-after-restart.png`; JSON contains counters and timestamps, not tokens. The audit endpoint now includes token issuance/expiry and tool acceptance/completion events. The automatic suite includes CIMD concurrent refresh, rotated-grant reload and a deterministic clock-controlled long-call expiry case; typechecking and all 20 tests passed.

## High- and medium-priority failure acceptance

Verified on 2026-11-16 with unmodified official DSH 0.2.2-rc.2 Web and the new `dsh-mcp-oauth-0.1.0.tgz` from the failure-acceptance pack directory. This package replaces build6 for these checks. No official DSH files were modified.

| Scenario | Automated evidence | Real Web evidence |
| --- | --- | --- |
| Refresh token revoked | Login-required error, tools withdrawn, no interactive retry | Chat reports sign-in required; no tool executes or new consent opens |
| Early 401 | One refresh, one successful tool execution | Covered by automated bridge test |
| Repeated 401 | One refresh, then sign-in required and zero tools | Two rejected requests, one refresh, no tool execution; settings show sign-in required |
| Response lost after acceptance | Unknown outcome; reconnect without replay | One accepted call, two connection initializations; chat explicitly says result unknown |
| Disconnect during long work | Barrier-controlled accepted long call; one execution, reconnect | Response-loss case above; held long-work case is automated |
| Tool timeout | Unknown outcome; one execution | Automated only |
| User cancellation | Cancellation reaches server, no replay | Stop button sends one cancellation; delayed work has cancelledAt and no completedAt |
| Clear/disable/unload during login or refresh | Six controlled Host cases; no late credential restore, no remaining tools or callback listener | Automated only |
| Concurrent expiry | Eight actual tool calls share one refresh | Automated only |
| Multiple services | Credential/tool namespaces and failure isolation | Healthy service search succeeds while failed service requires login |
| Tool list changes | Real SSE notification; removed tools disappear; duplicate names never partially register | Settings count changes 2 → 3 → 1 |
| Reconnect budget and manual recovery | Two retries after initial failure, then stop; explicit reconnect recovers | Successful reconnect after response loss; exhaustion is automated |
| Configuration identity changes | URL, metadata identity, callback, scope, mode/client ID do not reuse mismatched grants | Automated only |
| Disable/enable/delete | Disable retains grant, enable restores tools without consent, delete removes grant and flow | Earlier enable/disable check plus current Host tests |
| Unload with an active call | Connection closes and drains in-flight work; no late tool registration | Automated only |

The fault fixture is started with `CIMD_CALLBACK_URL=http://127.0.0.1:16278/oauth/callback pnpm exec tsx tests/serve-cimd.ts`. Its optional `/test-control` route exists only in audit-enabled manual fixtures. POST a strict JSON object with selected flags (`dropCalls`, `rejectTokens`, `rejectOnce`, `refreshFails`, `failInitialize`) or `toolNames`. Requests with Origin or a content type other than application/json are rejected; the server listens only on loopback. These controls are test infrastructure and are not in the npm plugin package.

The browser sequence used `cimd-faults`: drop response, cancel a 60-second delayed call, reject every bearer token, manually sign in again, publish tool-list changes, reject one bearer request while refusing refresh, then call the separate healthy `cimd-test` service. Its final pre-reset audit recorded two manual authorizations, zero DCR registrations, two accepted tools (one dropped response, one cancelled), one successful refresh and one refused refresh. No new tool execution occurred during either authentication failure. All fault flags were reset after validation; the fault service remains sign-in required until explicitly logged in again.

Local evidence lives in ignored `artifacts/evidence/faults-{drop,cancel,401,refresh}.json` and `dsh-fault-*.png` / `dsh-faults-and-isolation.png`. The regression suite now has 47 passing tests. New tests first exposed exhausted-401 misclassification, missing persistent authentication error status and missing reconnect after a lost tool response; these were fixed in the accepted package. The package also drains active calls during close and gives unknown-outcome failures an explicit no-automatic-retry message.

This matrix distinguishes automated published-API integration tests from actual browser evidence. It does not constitute Desktop qualification, public-network identity-provider acceptance, or a claim that every matrix row was exercised through a model chat.


## Remote personal-instance preview

The unreleased 0.2.0-rc.1 build passed typecheck and 54 automated tests on 2026-11-16. New cases use an HTTPS proxy with per-test certificate trust to forward browser-equivalent requests to a loopback receiver. They verify exact Host/path and state matching, ambiguous and duplicate responses, cancellation/timeouts, occupied internal ports, independent instance states, CIMD/PKCE exchange, refresh and restarted grant reuse followed by a search. The Host test also rejects non-owner list, save and login requests.

A clean official DSH Web installation loaded the tarball and its settings page. Browser checks covered local defaults, remote selection, rejection of an HTTP callback in remote mode, saving HTTPS CIMD configuration and reopening the saved fields. This UI check did not perform remote browser consent or a model-driven search through a deployed ingress. Organization ingress routing, owner-session mapping, trusted TLS and real OAuth acceptance still require deployment-specific verification; Desktop remains unqualified.

## Manual response preview

The unreleased 0.2.0-rc.1 build passed typecheck and 69 automated tests on 2026-11-16. Manual-mode cases cover CIMD, DCR and pre-registration with PKCE, one-use exchange, refresh and restarted credential reuse followed by a search. Parser tests cover wrong destinations, state and issuer mismatch, duplicate fields, denial, cancellation and timeout. Host tests cover owner-only submission, clear/disable/unload/cancel races, tool registration and absence of the submitted code from configuration, grant records, returned state and captured logs. The original local and remote automatic-callback tests remain in the suite.

A clean official DSH Web installation loaded the packed tarball without workspace links. In the settings page, manual CIMD configuration was saved, a malformed response was rejected and cleared, and cancellation removed the input. A new browser consent then redirected to a separate loopback display fixture. Copying its full URL into the masked plugin input completed exchange and discovery; the page showed **Authorized · Connected · Tools: 2**. The display fixture did not exchange tokens or forward responses. This used the repository's local OAuth/MCP and HTTPS CIMD fixtures, not a company service. The browser check verified consent, form submission and discovery, not a new model-driven chat call or Desktop qualification.

The in-app browser's failed-navigation API exposed an internal error page instead of the original callback URL, so the UI run used the independent display fixture. No-listener operation is covered by automated tests that fail if the plugin tries to create a callback listener. For reproduction, start `tests/serve-cimd.ts` with `CIMD_CALLBACK_URL` set to a registered loopback URL, then follow the [manual authorization guide](manual-authorization.md) in a normal browser. Use an unused port when relying on the connection-failure address bar, or an isolated display fixture that does not log request URLs.
