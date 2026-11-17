# Changelog

## 0.2.0-rc.2 — 2026-11-17

- Report malformed MCP URLs as field validation errors. Exclude unused metadata URLs when saving DCR or pre-registered settings, and identify invalid fields in localized messages.

- Allocate an available local callback port when the URL omits it; declare native CIMD redirects for both localhost and 127.0.0.1. Keep explicit ports and existing configuration unchanged.

- Host a public CIMD document on GitHub Pages and prefill its editable URL under Advanced for new services; preserve existing values. Invalid metadata URLs report validation errors.

- Simplify the service form with Advanced settings, registration-specific fields and bilingual help tooltips. Restrict the default hosted CIMD document to local callbacks.

- Move Service ID into Advanced and generate it from the display name for new services. Keep saved IDs read-only and report duplicate IDs for manual correction.
- Add sanitized Host OAuth failure diagnostics with operation stages, bounded error chains, network/OAuth reason codes and proxy tunnel rejection status. Raw messages, URLs, stacks and credentials are excluded.
- Preserve existing Client error codes and authentication recovery behavior.

## 0.2.0-rc.1 — 2026-11-16

- Lower the DSH requirement to `>=0.2.1-alpha.3`, using the public `dsh-llm` error export and the Client locale type entry. Build against the minimum version and validate all 17 published 0.2.x versions.

- Manual authorization response submission through an owner-only settings form, with no listener, one-use state and PKCE retained.

- Remote personal-instance OAuth callbacks through an HTTPS reverse proxy, with a separate loopback listener port.
- Deployment selection and bilingual guidance in settings.
- Reject ambiguous callback parameters; preserve one-use state, PKCE and owner-only credential access.
- Existing settings default to local mode. Older versions cannot read newly saved callback fields; restore compatible configuration before downgrade.

## 0.1.0 — 2026-11-16

- Public npm identity: `@noob9527/dsh-mcp-oauth`, including scoped Host and Client module registration.

- Standalone Host/Client plugin targeting unmodified DSH 0.2.2-rc.2.
- Streamable HTTP tools with OAuth Authorization Code + PKCE, CIMD, pre-registration and DCR.
- Profile/service credential isolation, refresh rotation, cancellation and bounded connection recovery.
- Service settings with English and Chinese labels.
- Deterministic local OAuth/MCP and HTTPS metadata fixtures; Web acceptance and failure matrix.

Initial preview release. Desktop qualification remains pending.
