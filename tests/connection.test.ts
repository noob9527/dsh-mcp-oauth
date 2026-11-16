/** Public tool bridge behavior against real HTTP OAuth/MCP fixtures. */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import Tools, { type ToolRunContext } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { Provider } from '../src/provider.ts'
import { Connection } from '../src/connection.ts'
import { serverSchema, type ServerStatus, type ServerConfig } from '../src/config.ts'
import { reserveCallback } from './callback-reservation.ts'
import { metadataHost } from './cimd-document.ts'
import { fixture, approve } from './fixture.ts'

async function until(predicate: () => boolean, message = 'Condition not reached') {
  const deadline = Date.now() + 5000
  while (!predicate()) { if (Date.now() > deadline) throw new Error(message); await delay(10) }
}
async function setup(t: TestContext, overrides: Partial<ServerConfig> = {}, shared?: Context) {
  const callback = await reserveCallback(t)
  const metadata = await metadataHost(callback.url); t.after(() => metadata.close())
  const server = await fixture({ cimd: metadata }); t.after(() => server.close())
  const ctx = shared ?? new Context()
  if (!shared) { await ctx.plugin(SystemPrompt); await ctx.plugin(Tools); t.after(() => ctx.fiber.dispose()) }
  let saved: unknown
  const config = serverSchema.parse({ id: 'bridge', label: 'Bridge', url: server.origin + '/mcp', mode: 'cimd', metadataUrl: metadata.url, redirectUrl: callback.url, reconnectMaxDelayMs: 100, reconnectAttempts: 2, ...overrides })
  const provider = new Provider(config, { read: async () => saved, write: async value => { saved = structuredClone(value) } }, callback.receive, server.now)
  let approval: Promise<void> | undefined
  await provider.login(new AbortController().signal, url => { approval = approve(url) }); await approval
  const status: ServerStatus = { config, authentication: 'authorized', connection: 'disconnected', toolCount: 0, error: '', authorizationUrl: '' }
  const connection = new Connection(ctx, provider, status)
  t.after(async () => { await connection.close(); await provider.stop() })
  const invoke = async (raw: string, args: Record<string, unknown> = {}, signal = new AbortController().signal) => {
    const name = `mcp__${config.id}__${raw}`; const definition = ctx.tools.get(name)
    assert(definition, `Tool unavailable: ${name}`)
    const callId = 'test-call' as ToolRunContext['callId']
    return definition.execute(args, { name, arguments: args, signal, callId, rootCallId: callId, token: Symbol() as ToolRunContext['token'], deferContext() {}, concludeTurn() {} })
  }
  return { server, ctx, provider, status, connection, invoke, saved: () => saved }
}
test('CIMD bridge: one early 401 refreshes once and executes once', async t => {
  const f = await setup(t); await f.connection.connect(); f.server.state.rejectOnce = true
  assert.match(JSON.stringify(await f.invoke('search', { query: '401' })), /document-1/)
  assert.equal(f.server.state.refreshes, 1); assert.equal(f.server.state.calls, 1)
})
test('CIMD bridge: repeated 401 withdraws tools and requires sign-in', async t => {
  const f = await setup(t); await f.connection.connect(); f.server.state.rejectTokens = true
  await assert.rejects(f.invoke('search'), { code: 'OAUTH_LOGIN_REQUIRED' })
  assert.equal(f.server.state.refreshes, 1); assert.equal(f.server.state.calls, 0)
  assert.equal(f.status.authentication, 'required'); assert.equal(f.status.toolCount, 0)
})
test('CIMD bridge: revoked refresh becomes sign-in required, without interactive retry', async t => {
  const f = await setup(t); await f.connection.connect()
  f.server.advanceTime(3_600_001); f.server.state.refreshFails = true
  await assert.rejects(f.invoke('search'), { code: 'OAUTH_LOGIN_REQUIRED' })
  assert.equal(f.status.authentication, 'required'); assert.equal(f.status.error, 'OAUTH_LOGIN_REQUIRED')
  assert.equal(f.status.toolCount, 0); assert.equal(f.server.state.authorizations, 1); assert.equal(f.server.state.calls, 0)
})
test('CIMD bridge: lost response reports unknown outcome, reconnects without replay', async t => {
  const f = await setup(t); await f.connection.connect(); f.server.state.dropCalls = true
  await assert.rejects(f.invoke('search'), { code: 'MCP_CALL_OUTCOME_UNKNOWN' })
  f.server.state.dropCalls = false
  await until(() => f.server.state.initializations === 2 && f.status.connection === 'connected')
  assert.equal(f.server.state.calls, 1)
  await f.invoke('search'); assert.equal(f.server.state.calls, 2)
})
test('CIMD bridge: timeout is unknown and sends no second tools/call', async t => {
  const f = await setup(t, { toolTimeoutMs: 100 }); await f.connection.connect()
  await assert.rejects(f.invoke('delayed_echo', { message: 'late', delayMs: 2000 }), { code: 'MCP_CALL_OUTCOME_UNKNOWN' })
  assert.equal(f.server.state.calls, 1)
})
test('CIMD bridge: cancellation reaches MCP and does not replay', async t => {
  const f = await setup(t); await f.connection.connect()
  const gate = f.server.holdCalls(); t.after(gate.release)
  const controller = new AbortController()
  const pending = f.invoke('delayed_echo', { message: 'cancel', delayMs: 2000 }, controller.signal)
  const rejected = assert.rejects(pending, { name: 'AbortError' })
  await gate.received; controller.abort(); gate.release(); await rejected
  await until(() => f.server.state.cancellations === 1)
  assert.equal(f.server.state.calls, 1)
  await until(() => !!f.server.callEvents[0]?.cancelledAt)
  assert.equal(f.server.callEvents[0]?.completedAt, undefined)
})
test('CIMD bridge: list change removes old tools; duplicates do not partially register', async t => {
  const f = await setup(t); await f.connection.connect()
  await until(() => f.server.streamCount > 0, 'MCP notification stream did not open')
  f.server.setTools(['replacement'])
  await until(() => !!f.ctx.tools.get('mcp__bridge__replacement'))
  assert.equal(f.ctx.tools.get('mcp__bridge__search'), undefined); assert.equal(f.status.toolCount, 1)
  f.server.setTools(['duplicate', 'duplicate'])
  await until(() => !!f.status.error)
  assert.equal(f.ctx.tools.get('mcp__bridge__duplicate'), undefined)
})
test('CIMD bridge: two services isolate tools, credentials and failures', async t => {
  const a = await setup(t, { id: 'one' }); const b = await setup(t, { id: 'two' }, a.ctx)
  await Promise.all([a.connection.connect(), b.connection.connect()])
  a.server.state.rejectTokens = true
  await assert.rejects(a.invoke('search'))
  assert.match(JSON.stringify(await b.invoke('search')), /document-1/)
  assert.notDeepEqual(a.saved(), b.saved()); assert.equal(b.status.connection, 'connected')
  await a.connection.close(); assert(a.ctx.tools.get('mcp__two__search'))
})
test('CIMD bridge: bounded reconnect exhausts, manual connect can recover', async t => {
  const f = await setup(t); f.server.state.failInitialize = true
  await f.connection.connect()
  await until(() => f.server.state.initializations === 3 && f.status.connection === 'failed')
  await delay(250) // Absence window exceeds the fixture's configured maximum retry interval.
  assert.equal(f.server.state.initializations, 3); assert.equal(f.status.toolCount, 0)
  f.server.state.failInitialize = false; await f.connection.connect()
  assert.equal(f.status.connection, 'connected'); assert.equal(f.status.toolCount, 2)
})
test('CIMD bridge: close drains active calls and prevents late registration', async t => {
  const f = await setup(t); await f.connection.connect()
  const gate = f.server.holdCalls(); t.after(gate.release)
  const pending = f.invoke('delayed_echo', { message: 'closing', delayMs: 2000 })
  const rejection = assert.rejects(pending)
  await gate.received; await f.connection.close(); gate.release(); await rejection
  assert.equal(f.status.toolCount, 0); assert.equal(f.ctx.tools.get('mcp__bridge__search'), undefined)
  await f.connection.connect(); assert.equal(f.status.toolCount, 0)
})

test('CIMD bridge: concurrent actual tools share one expiry refresh', async t => {
  const f = await setup(t); await f.connection.connect(); f.server.advanceTime(3_600_001)
  const results = await Promise.all(Array.from({ length: 8 }, (_, index) => f.invoke('search', { query: `parallel-${index}` })))
  assert.equal(results.length, 8); assert.equal(f.server.state.calls, 8)
  assert.equal(f.server.state.refreshRequests, 1); assert.equal(f.server.state.refreshes, 1)
})
test('CIMD bridge: disconnect during held long work never replays the accepted call', async t => {
  const f = await setup(t); await f.connection.connect()
  const gate = f.server.holdCalls(); t.after(gate.release)
  const pending = f.invoke('delayed_echo', { message: 'in-flight', delayMs: 20000 })
  const rejected = assert.rejects(pending, { code: 'MCP_CALL_OUTCOME_UNKNOWN' })
  await gate.received; f.server.state.dropCalls = true; gate.release(); await rejected
  await until(() => f.status.connection === 'connected' && f.server.state.initializations === 2)
  assert.equal(f.server.state.calls, 1); assert.equal(f.server.callEvents[0]!.dropped, true)
})
