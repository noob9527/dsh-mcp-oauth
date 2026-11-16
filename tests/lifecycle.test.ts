/** Host cleanup and identity isolation through the published Remote API. */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { Context } from '@deepseek-ai/cordis'
import Registry from '@deepseek-ai/dsh-typert-registry'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import RemoteAccess from '@deepseek-ai/dsh-api-remote-access'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import Authorization from '@deepseek-ai/dsh-authorization'
import Tools from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { z } from 'zod'
import { withCallbackListener } from '../src/index.ts'
import { serverSchema, statusSchema } from '../src/config.ts'
import { Provider, binding } from '../src/provider.ts'
import { reserveCallback } from './callback-reservation.ts'
import { fixture, approve } from './fixture.ts'
import { metadataHost } from './cimd-document.ts'

async function host(t: TestContext) {
  const callback = await reserveCallback(t)
  const metadata = await metadataHost(callback.url); t.after(() => metadata.close())
  const server = await fixture({ cimd: metadata }); t.after(() => server.close())
  const dir = await mkdtemp(join(tmpdir(), 'mcp-lifecycle-')); const ctx = new Context()
  t.after(async () => { await ctx.fiber.dispose(); await rm(dir, { recursive: true, force: true }) })
  const credentials = join(dir, 'credentials.yaml')
  ctx.provide('profileContext', { name: 'test', dir, patchPath: join(dir, 'cordis.patch.yml'), installAnchor: dir, cwd: dir, home: dir, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined })
  await ctx.plugin(Registry); await ctx.plugin(RemoteAccess); await ctx.plugin(Gateway)
  await ctx.plugin(Credentials, { path: credentials, watch: false }); await ctx.plugin(Authorization)
  await ctx.plugin(SystemPrompt); await ctx.plugin(Tools)
  const plugin = withCallbackListener(callback.receive); const fiber = ctx.plugin(plugin); await fiber
  const peer = new Peer(ctx, { principal: { kind: 'owner' } })
  const call = (method: string, args: Record<string, unknown> = {}) => ctx.typertGateway.invoke({ peer, namespace: 'mcpOAuth', method, args })
  const row = async () => z.array(statusSchema).parse(await call('list'))[0]!
  const until = async (predicate: (value: Awaited<ReturnType<typeof row>>) => boolean) => {
    const deadline = Date.now() + 5000
    for (;;) { const value = await row(); if (predicate(value)) return value; if (Date.now() > deadline) throw new Error('Host state did not settle'); await delay(10) }
  }
  const config = serverSchema.parse({ id: 'test', label: 'Test', url: server.origin + '/mcp', mode: 'cimd', metadataUrl: metadata.url, redirectUrl: callback.url })
  await call('save', { config })
  const login = async () => { await call('act', { id: 'test', action: 'login' }); const pending = await until(value => !!value.authorizationUrl); await approve(pending.authorizationUrl); await until(value => value.connection === 'connected') }
  return { ctx, server, callback, metadata, dir, credentials, config, call, row, until, login, fiber, plugin }
}
for (const action of ['clear', 'disable', 'unload'] as const) test(`CIMD Host: ${action} during login closes callback and cannot restore grant`, async t => {
  const f = await host(t)
  await f.call('act', { id: 'test', action: 'login' }); const waiting = await f.until(row => !!row.authorizationUrl)
  assert(waiting.authorizationUrl)
  if (action === 'unload') await f.fiber.dispose()
  else if (action === 'disable') await f.call('save', { config: { ...f.config, enabled: false } })
  else await f.call('act', { id: 'test', action: 'clear' })
  assert.equal(f.callback.server.listening, false); assert.equal(f.ctx.tools.get('mcp__test__search'), undefined)
  await assert.rejects(approve(waiting.authorizationUrl))
  assert.equal(f.server.state.tokenExchanges, 0)
  if (action !== 'unload') { const row = await f.row(); assert.equal(row.authentication, 'required'); assert.equal(row.authorizationUrl, '') }
})
for (const action of ['clear', 'disable', 'unload'] as const) test(`CIMD Host: ${action} during refresh prevents late credential write`, async t => {
  const f = await host(t); await f.login()
  f.server.advanceTime(3_600_001)
  // Reconnect forces token evaluation even with no model request.
  await f.call('save', { config: { ...f.config, enabled: false } })
  const before = await readFile(f.credentials, 'utf8')
  const gate = f.server.holdRefresh(); t.after(gate.release)
  // Shorten the next provider's known expiry by configuring early refresh.
  f.server.state.tokenSeconds = 1
  // The saved client clock has not advanced, so invalidate the access token at the server;
  // initialize receives 401 and initiates refresh.
  await f.call('save', { config: f.config })
  await gate.received
  if (action === 'unload') await f.fiber.dispose()
  else if (action === 'disable') await f.call('save', { config: { ...f.config, enabled: false } })
  else await f.call('act', { id: 'test', action: 'clear' })
  gate.release()
  assert.equal(f.ctx.tools.get('mcp__test__search'), undefined)
  const after = await readFile(f.credentials, 'utf8')
  if (action === 'clear') assert(!after.includes('access_token'))
  else assert.equal(after, before)
  if (action !== 'unload') assert.equal((await f.row()).toolCount, 0)
})
test('CIMD Host: disable retains grant, enable restores tools, delete removes authorization', async t => {
  const f = await host(t); await f.login()
  const before = await readFile(f.credentials, 'utf8')
  await f.call('save', { config: { ...f.config, enabled: false } })
  assert.equal((await f.row()).connection, 'disabled'); assert.equal(f.ctx.tools.get('mcp__test__search'), undefined)
  assert.equal(await readFile(f.credentials, 'utf8'), before)
  await f.call('save', { config: f.config }); await f.until(row => row.connection === 'connected')
  assert.equal(f.server.state.authorizations, 1)
  await f.call('act', { id: 'test', action: 'remove' })
  assert.deepEqual(await f.call('list'), []); assert.equal(f.ctx.authorization.list().length, 0)
  assert(!((await readFile(f.credentials, 'utf8')).includes('access_token')))
})
test('CIMD Host: changing metadata identity does not reuse previous authorization', async t => {
  const f = await host(t); await f.login()
  await f.call('save', { config: { ...f.config, metadataUrl: 'https://other.example.com/client.json' } })
  assert.equal((await f.row()).authentication, 'required'); assert.equal((await f.row()).toolCount, 0)
  assert.equal(f.ctx.tools.get('mcp__test__search'), undefined)
})
for (const change of [ { url: 'https://other.example.com/mcp' }, { metadataUrl: 'https://other.example.com/client.json' }, { redirectUrl: 'http://127.0.0.1:6275/oauth/callback' }, { scope: 'different' }, { mode: 'preregistered' as const, clientId: 'other' } ]) test(`grant identity excludes changed ${Object.keys(change).join('/')}`, async () => {
  const config = serverSchema.parse({ id: 'test', label: 'Test', url: 'https://mcp.example.com/mcp', mode: 'cimd', metadataUrl: 'https://client.example.com/client.json' })
  const provider = new Provider({ ...config, ...change }, { read: async () => ({ version: 1, binding: binding(config), tokens: { access_token: 'fixture-token', token_type: 'Bearer' } }), write: async () => {} })
  await provider.load(); assert.equal(provider.authorized, false); await provider.stop()
})
test('CIMD explicit unsupported discovery does not register or open a browser', async t => {
  const callback = await reserveCallback(t); const server = await fixture(); t.after(() => server.close()); server.state.cimdSupported = false
  const config = serverSchema.parse({ id: 'test', label: 'Test', url: server.origin + '/mcp', mode: 'cimd', metadataUrl: 'https://client.example.com/client.json', redirectUrl: callback.url })
  const provider = new Provider(config, { read: async () => undefined, write: async () => {} }, callback.receive); t.after(() => provider.stop())
  await assert.rejects(provider.login(new AbortController().signal, () => assert.fail('Must not open browser')), { code: 'OAUTH_CIMD_UNSUPPORTED' })
  assert.equal(server.state.registrations, 0); assert.equal(callback.server.listening, false)
})
test('CIMD authorization timeout closes its callback listener', async t => {
  const callback = await reserveCallback(t); const server = await fixture(); t.after(() => server.close())
  const config = serverSchema.parse({ id: 'timeout', label: 'Timeout', url: server.origin + '/mcp', redirectUrl: callback.url, authTimeoutMs: 100 })
  const provider = new Provider(config, { read: async () => undefined, write: async () => {} }, callback.receive); t.after(() => provider.stop())
  await assert.rejects(provider.login(new AbortController().signal, () => {}))
  assert.equal(callback.server.listening, false); assert.equal(provider.authorized, false)
})
