# Changelog

## Unreleased — 0.2.0-rc.1

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
