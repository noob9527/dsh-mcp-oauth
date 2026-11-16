# DSH 0.2.x compatibility

Checked on 2026-11-16 against the public npm registry. The lowest supported release for the current implementation is **0.2.2-rc.2**. The source candidate supports exactly `0.2.2-rc.2 || 0.2.2-rc.3`; the already published plugin 0.1.0 still declares rc.2 only. A new package release is required to distribute the expanded declaration.

## Published-version matrix

| DSH version | Result |
| --- | --- |
| `0.2.0-rc.1` | Missing matching `dsh-api-remote-access`, `dsh-error`; older Cordis |
| `0.2.0-rc.2` | Missing matching `dsh-api-remote-access`, `dsh-error`; older Cordis |
| `0.2.1-alpha.1` | Missing matching `dsh-api-remote-access`, `dsh-error`; older Cordis |
| `0.2.1-alpha.2` | Missing matching `dsh-api-remote-access`, `dsh-error`; older Cordis |
| `0.2.1-alpha.3` | Missing matching `dsh-error` |
| `0.2.1-alpha.4` | Missing matching `dsh-error` |
| `0.2.1-alpha.5` | Missing matching `dsh-error` |
| `0.2.1-rc.1` | Missing matching `dsh-error` |
| `0.2.1-rc.2` | Missing matching `dsh-error` |
| `0.2.1-rc.3` | Missing matching `dsh-error` |
| `0.2.1-rc.4` | Missing matching `dsh-error` |
| `0.2.1-rc.5` | Missing matching `dsh-error` |
| `0.2.2-alpha.2` | Missing matching `dsh-error` |
| `0.2.2-alpha.3` | Missing matching `dsh-error` |
| `0.2.2-rc.1` | Missing matching `dsh-error` |
| `0.2.2-rc.2` | 47/47 tests, typecheck, build, CLI, packed Web installation and CIMD/chat acceptance passed |
| `0.2.2-rc.3` | 47/47 tests, typecheck, build, CLI, packed Web installation and CIMD/chat acceptance passed |

The fifteen earlier versions fail the matching-peer prerequisite; they were not reported as passing runtime tests. `src/errors.ts` imports `HarnessError` from `@deepseek-ai/dsh-error`, whose matching release is absent before rc.2. The first four versions also lack `api-remote-access` and the checked `typert-protocol` declarations do not expose `principalOf`. These are implementation dependencies, not proof that an older DSH can never support OAuth. Supporting older versions requires a separately tested compatibility implementation; importing newer Host packages into an older runtime is not accepted as evidence.

## Verification

For each viable version, all DSH direct test and peer packages were pinned to that exact version in a separate temporary directory. No workspace links or edits to official packages were used. The suite covers DCR, pre-registration and CIMD; token rotation and concurrent refresh; long calls, cancellation, one-time 401 recovery and no unsafe replay; tool updates, multiple services and unload cleanup. Each version passed 47 tests, source/test typecheck, declaration/client/Host build, and the official Web CLI smoke.

The same candidate tarball, built against rc.2 with the expanded compatibility declaration, was installed with `dsh plugin --profile web add` into both clean official Web profiles. On macOS, both settings pages loaded, completed browser CIMD authorization against the repository's local HTTPS metadata/OAuth/MCP fixture, and displayed two connected tools. Real model chat invoked `mcp__compat__search` once per version with `compat-rc2` / `compat-rc3`, returning `document-1`. The model key and all profiles, screenshots, callback values and raw logs stay outside this repository.

Desktop and remote-host OAuth remain outside this verification. No conclusion about remote callback routing or multi-user isolation follows from version compatibility. Unpublished/future versions are not admitted by the exact union.

## Reproduce

```sh
pnpm run test:compatibility
# Or a focused repeat:
pnpm run test:compatibility 0.2.2-rc.2 0.2.2-rc.3
```

The script queries the official registry for all required packages and rejects versions missing matching DSH peers before installation. It installs, typechecks, tests, builds and runs the official CLI for viable versions. Each run creates a private temporary root and prints its location; `report.json`, per-stage logs and lockfiles remain there for inspection. Model credentials and existing DSH home variables are excluded from child environments. Network access and OpenSSL are required. The script does not automate browser consent or real-model chat; perform those separately using the acceptance workflow and the exact packed artifact before expanding the declared support set. Local execution does not establish GitHub CI or other-platform results.
