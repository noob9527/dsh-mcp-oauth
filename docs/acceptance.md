# Official-client acceptance

Use an isolated `DSH_HOME` and an unmodified npm installation of DSH 0.2.2-rc.2. Never use source overlays or workspace links as release evidence.

1. Run `pnpm pack`, then install the tarball with `dsh plugin --profile web add /absolute/path/to/dsh-mcp-oauth-0.1.0.tgz`.
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
