/** Manual browser-acceptance fixture. Prints only its public loopback endpoint. */
import { fixture } from './fixture.ts'
const server = await fixture()
console.log(`MCP test service: ${server.origin}/mcp`)
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void server.close().then(() => process.exit(0)) })
