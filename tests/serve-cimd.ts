/** Browser acceptance: independent HTTPS CIMD host plus OAuth/MCP fixture. */
import { metadataHost } from './cimd-document.ts'
import { z } from 'zod'
import { fixture } from './fixture.ts'
const callback = process.env.CIMD_CALLBACK_URL ?? 'http://127.0.0.1/oauth/callback'
const tokenSeconds = z.coerce.number().int().min(1).max(86400).parse(process.env.CIMD_TOKEN_SECONDS ?? 3600)
const metadata = await metadataHost(callback)
const server = await fixture({ cimd: metadata, audit: true, tokenSeconds })
console.log(JSON.stringify({ mcp: server.origin + '/mcp', metadata: metadata.url, callback, audit: server.origin + '/test-audit' }))
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void server.close().then(() => metadata.close()).then(() => process.exit(0)) })
