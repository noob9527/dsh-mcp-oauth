import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Registry from '@deepseek-ai/dsh-typert-registry'
import Gateway from '@deepseek-ai/dsh-api-gateway'
import RemoteAccess from '@deepseek-ai/dsh-api-remote-access'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import Authorization from '@deepseek-ai/dsh-authorization'
import Tools from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as plugin from '../src/index.ts'
import { serverSchema, statusSchema } from '../src/config.ts'
import { z } from 'zod'
import { reserveCallback } from './callback-reservation.ts'
import { setTimeout as delay } from 'node:timers/promises'
import { fixture, approve } from './fixture.ts'

declare module '@deepseek-ai/dsh-typert-protocol' { interface PrincipalMap { oauthTestGuest: { kind: 'oauth-test-guest' } } }

test('official Host gateway loads strict methods, persists services and withdraws on unload', async t => {
  const callback = await reserveCallback(t)
  const configuredPlugin = plugin.withCallbackListener(callback.receive)
  const dir = await mkdtemp(join(tmpdir(), 'mcp-oauth-host-'))
  const ctx = new Context()
  t.after(async () => { await ctx.fiber.dispose(); await rm(dir, { recursive: true, force: true }) })
  ctx.provide('profileContext', { name: 'test', dir, patchPath: join(dir, 'cordis.patch.yml'), installAnchor: dir, cwd: dir, home: dir, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined })
  await ctx.plugin(Registry)
  await ctx.plugin(RemoteAccess)
  await ctx.plugin(Gateway)
  await ctx.plugin(Credentials, { path: join(dir, 'credentials.yaml'), watch: false })
  await ctx.plugin(Authorization)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(Tools)
  const fiber = ctx.plugin(configuredPlugin); await fiber
  const peer = new Peer(ctx, { principal: { kind: 'owner' } })
  const call = (method: string, args: Record<string, unknown> = {}) => ctx.typertGateway.invoke({ peer, namespace: 'mcpOAuth', method, args })
  assert(ctx.typert.local.get('mcpOAuth/list'))
  assert.deepEqual(await call('list'), [])
  const guest = new Peer(ctx, { principal: { kind: 'oauth-test-guest' } })
  for (const [method, args] of [
    ['list', {}],
    ['save', { config: serverSchema.parse({ id: 'guest', label: 'Guest', url: 'https://mcp.example.com/mcp' }) }],
    ['act', { id: 'one', action: 'login' }],
  ] as const) {
    await assert.rejects(async () => ctx.typertGateway.invoke({ peer: guest, namespace: 'mcpOAuth', method, args }))
  }

  const config = serverSchema.parse({ id: 'one', label: 'One', url: 'https://mcp.example.com/mcp', enabled: false })
  await call('save', { config })
  const rows = z.array(statusSchema).parse(await call('list'))
  assert.equal(rows.length, 1); assert.equal(rows[0]!.connection, 'disabled')
  assert.equal(ctx.authorization.list().length, 1)
  assert.match(await readFile(join(dir, 'mcp-oauth', 'servers.json'), 'utf8'), /mcp.example.com/)
  await fiber.dispose()
  assert.equal(ctx.authorization.list().length, 0)
  assert.equal(ctx.typert.local.get('mcpOAuth/list'), undefined)
  await assert.rejects(call('list'))
  const next = ctx.plugin(configuredPlugin); await next
  assert.equal(z.array(statusSchema).parse(await call('list')).length, 1)
  await call('act', { id: 'one', action: 'remove' })
  assert.deepEqual(await call('list'), [])
  const server = await fixture(); t.after(() => server.close())
  const live = serverSchema.parse({ id: 'live', label: 'Live', url: server.origin + '/mcp', redirectUrl: callback.url })
  await call('save', { config: live })
  await call('act', { id: 'live', action: 'login' })
  async function until(predicate: (row: z.infer<typeof statusSchema>) => boolean) {
    for (let attempt = 0; attempt < 250; attempt++) {
      const row = z.array(statusSchema).parse(await call('list'))[0]!
      if (predicate(row)) return row
      await delay(20)
    }
    throw new Error('Host operation did not complete')
  }
  const waiting = await until(row => !!row.authorizationUrl)
  await approve(waiting.authorizationUrl)
  const ready = await until(row => row.connection === 'connected')
  assert.equal(ready.toolCount, 2); assert.equal(ready.authentication, 'authorized')
  assert(ctx.tools.get('mcp__live__search'))
  await call('act', { id: 'live', action: 'clear' })
  assert.equal(ctx.tools.get('mcp__live__search'), undefined)
  assert.equal((await until(row => row.authentication === 'required')).toolCount, 0)
  await next.dispose()
})
