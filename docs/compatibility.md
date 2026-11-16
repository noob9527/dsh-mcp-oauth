# DSH 0.2.x compatibility

Checked on 2026-11-16 against the public npm registry. The source candidate requires **`>=0.2.1-alpha.3`**. This is a minimum-version range, not an exact-version allowlist. The official DSH installer includes prereleases when evaluating this range. Future versions can install without editing the manifest, but compatibility with an untested future API is not guaranteed. The published plugin 0.1.0 retains its original requirement; these changes require a new package release.

## Published-version matrix

| DSH version | Automated result |
| --- | --- |
| `0.2.0-rc.1` | Unsupported: matching `dsh-api-remote-access` is unavailable |
| `0.2.0-rc.2` | Unsupported: matching `dsh-api-remote-access` is unavailable |
| `0.2.1-alpha.1` | Unsupported: matching `dsh-api-remote-access` is unavailable |
| `0.2.1-alpha.2` | Unsupported: matching `dsh-api-remote-access` is unavailable |
| `0.2.1-alpha.3` | 70/70 tests; typecheck, build and official CLI passed |
| `0.2.1-alpha.4` | 70/70 tests; typecheck, build and official CLI passed |
| `0.2.1-alpha.5` | 70/70 tests; typecheck, build and official CLI passed |
| `0.2.1-rc.1` | 70/70 tests; typecheck, build and official CLI passed |
| `0.2.1-rc.2` | 70/70 tests; typecheck, build and official CLI passed |
| `0.2.1-rc.3` | 70/70 tests; typecheck, build and official CLI passed |
| `0.2.1-rc.4` | 70/70 tests; typecheck, build and official CLI passed |
| `0.2.1-rc.5` | 70/70 tests; typecheck, build and official CLI passed |
| `0.2.2-alpha.2` | 70/70 tests; typecheck, build and official CLI passed |
| `0.2.2-alpha.3` | 70/70 tests; typecheck, build and official CLI passed |
| `0.2.2-rc.1` | 70/70 tests; typecheck, build and official CLI passed |
| `0.2.2-rc.2` | 70/70 tests; typecheck, build and official CLI passed |
| `0.2.2-rc.3` | 70/70 tests; typecheck, build and official CLI passed |

## Compatibility implementation

`HarnessError` comes from the public `@deepseek-ai/dsh-llm` root, available throughout the supported releases. The plugin remains a native Host `HarnessError` subclass with stable machine-readable codes. Client locale types come from the public `/client` entry. No official package, prototype or internal source import is patched.

The first four versions also lack the checked `typert-protocol` public `principalOf` declaration used for owner-only settings and credential access. They are rejected rather than removing the identity check or mixing newer Host packages into an older runtime. The floor describes this plugin implementation, not a claim that earlier DSH can never support OAuth.

Development dependencies and the lockfile are pinned to the minimum supported DSH version. DSH peers and `engines.dsh` declare the same minimum range; Cordis requires `>=4.0.5-alpha.2`. `check:release` exercises the official installer API against versions below, at and above the floor, including later prereleases. npm peer warnings follow npm's own prerelease rules; they do not replace the DSH runtime compatibility check.

## Automated coverage

Each viable version uses a separate temporary npm installation with all direct DSH test and peer dependencies pinned to that version and Cordis selected from that release's own dependency declaration. All 13 supported published versions passed 70 tests each (910 passing test executions), typechecking, Host/Client/declaration builds and `dsh web --help`. No workspace links or official source edits are used.

The tests cover DCR, pre-registration, CIMD, token expiry and rotation, concurrent refresh, long calls, cancellation, bounded 401 recovery, no unsafe replay, tool updates, multiple services, credential reuse and unload cleanup. Remote callback and manual response tests run against local fixtures; they do not establish an external deployment's proxy routing or user isolation.

## Packed Web acceptance

On macOS, the same candidate tarball built against the minimum version was installed with the official `dsh plugin --profile web add` command into clean `0.2.1-alpha.3` and `0.2.2-rc.1` profiles, with no compatibility exemptions. Both loaded the settings page, completed independent browser CIMD authorization against the local HTTPS metadata/OAuth/MCP fixture, discovered two tools and invoked `mcp__compat__search` from real model chat. The UI displayed inputs and the `document-1` result for `compat-min-alpha3` and `compat-022-rc1`. The fixture recorded two validated metadata fetches, two token exchanges, zero DCR registrations and exactly two search calls.

The final package differs from that browser-tested archive only in documentation; package metadata, patch and every built runtime/type file are byte-identical. Raw evidence, credentials, profiles and screenshots remain outside the public repository. Client acceptance is distinct from the 13-version automated matrix: the other eleven versions were not all retested in the browser for this candidate. Earlier rc.2/rc.3 evidence belongs to the earlier implementation. Desktop and external remote deployments are not certified by this version matrix. See [official-client acceptance](acceptance.md) for deployment-specific limitations.

## Reproduce

```sh
pnpm run test:compatibility
# Or focus on the minimum and a later release:
pnpm run test:compatibility 0.2.1-alpha.3 0.2.2-rc.1
```

The script queries the official registry and rejects missing matching DSH peers before installation. It discovers all test files rather than a fixed subset. It prints a private temporary evidence directory containing `report.json`, stage logs and isolated lockfiles. Existing model credentials and DSH home variables are excluded from child environments. Network access and OpenSSL are required. Browser consent and real-model chat require separate packed-plugin acceptance. Local checks do not establish GitHub CI or other-platform results.
