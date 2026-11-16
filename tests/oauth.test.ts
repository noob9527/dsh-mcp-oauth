import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { Provider, binding } from '../src/provider.ts'
import { serverSchema } from '../src/config.ts'
import { listenCallback } from '../src/callback.ts'
import { fixture, approve } from './fixture.ts'

import { metadataHost } from './cimd-document.ts'
import { reserveCallback } from './callback-reservation.ts'

for (const mode of ['dcr', 'cimd', 'preregistered'] as const) test(`${mode}: authorization, tool result and restart reuse`, async t => {
  const callback = await reserveCallback(t)
  const metadata = mode === 'cimd' ? await metadataHost(callback.url) : undefined
  if (metadata) t.after(() => metadata.close())
  const server = await fixture({ cimd: metadata }); t.after(() => server.close())
  let saved: unknown
  const config = serverSchema.parse({ id: 'test', label: 'Test', url: server.origin + '/mcp', mode,
    redirectUrl: callback.url, metadataUrl: metadata?.url ?? '', clientId: mode === 'preregistered' ? 'test-client' : '' })
  const store = { read: async () => saved, write: async (value: unknown) => { saved = structuredClone(value) } }
  const provider = new Provider(config, store, callback.receive); t.after(() => provider.stop())
  let approval: Promise<void> | undefined
  await provider.login(new AbortController().signal, url => { approval = approve(url) })
  await approval
  assert(provider.authorized)
  assert.equal(server.state.registrations, mode === 'dcr' ? 1 : 0)
  const restarted = new Provider(config, store, callback.receive); await restarted.load(); t.after(() => restarted.stop())
  const client = new Client({ name: 'test', version: '1' }); t.after(() => client.close())
  await client.connect(new StreamableHTTPClientTransport(new URL(config.url), { authProvider: restarted.transportAuth }))
  const result = await client.callTool({ name: 'search', arguments: { query: 'oauth' } })
  assert.match(JSON.stringify(result), /document-1/)
  assert.equal(server.state.calls, 1)
  assert.equal(server.state.metadataValidated, mode === 'cimd' ? 1 : 0)
  if (metadata) assert.equal(metadata.state.fetches, 1)
})
for (const mode of ['dcr', 'cimd'] as const) test(`${mode}: concurrent refresh rotates once; restarted provider reuses rotated grant`, async t => {
  const callback = await reserveCallback(t)
  const metadata = mode === 'cimd' ? await metadataHost(callback.url) : undefined
  if (metadata) t.after(() => metadata.close())
  const server = await fixture({ cimd: metadata }); t.after(() => server.close())
  server.state.tokenSeconds = 30
  let saved: unknown
  const config = serverSchema.parse({ mode, metadataUrl: metadata?.url ?? '', id: 'test', label: 'Test', url: server.origin + '/mcp', redirectUrl: callback.url })
  const provider = new Provider(config, { read: async () => saved, write: async value => { saved = structuredClone(value) } }, callback.receive); t.after(() => provider.stop())
  let approval: Promise<void> | undefined
  await provider.login(new AbortController().signal, url => { approval = approve(url) }); await approval
  const before = JSON.stringify(saved)
  await Promise.all(Array.from({ length: 10 }, () => provider.transportAuth.token()))
  assert.equal(server.state.refreshes, 1)
  assert.notEqual(JSON.stringify(saved), before)
  await provider.stop()
  await assert.rejects(provider.saveTokens({ access_token: 'late', token_type: 'Bearer' }))
  assert(!JSON.stringify(saved).includes('late'))
  const restarted = new Provider(config, { read: async () => saved, write: async value => { saved = structuredClone(value) } }, callback.receive)
  t.after(() => restarted.stop())
  await restarted.load()
  assert(await restarted.transportAuth.token())
  assert.equal(server.state.refreshes, 2)
  assert.equal(server.state.authorizations, 1)
  assert.equal(server.state.tokenExchanges, 1)
  assert.equal(server.state.registrations, mode === 'cimd' ? 0 : 1)
})
for (const mode of ['dcr', 'cimd'] as const) test(`${mode}: long accepted call survives expiry; following request refreshes`, async t => {
  const callback = await reserveCallback(t)
  const metadata = mode === 'cimd' ? await metadataHost(callback.url) : undefined
  if (metadata) t.after(() => metadata.close())
  const server = await fixture({ cimd: metadata }); t.after(() => server.close())
  const config = serverSchema.parse({ mode, metadataUrl: metadata?.url ?? '', id: 'long', label: 'Long', url: server.origin + '/mcp', redirectUrl: callback.url, refreshSkewMs: 0 })
  const provider = new Provider(config, { read: async () => undefined, write: async () => {} }, callback.receive, server.now); t.after(() => provider.stop())
  let approval: Promise<void> | undefined
  await provider.login(new AbortController().signal, url => { approval = approve(url) }); await approval
  const client = new Client({ name: 'test', version: '1' }); t.after(() => client.close())
  await client.connect(new StreamableHTTPClientTransport(new URL(config.url), { authProvider: provider.transportAuth }))
  const gate = server.holdCalls(); t.after(gate.release)
  const request = client.callTool({ name: 'delayed_echo', arguments: { message: 'finished', delayMs: 0 } })
  await gate.received
  server.advanceTime(3_600_001)
  gate.release()
  const result = await request
  assert.match(JSON.stringify(result), /finished/)
  assert.equal(server.state.calls, 1); assert.equal(server.state.refreshes, 0)
  await client.callTool({ name: 'search', arguments: { query: 'after' } })
  assert.equal(server.state.calls, 2); assert.equal(server.state.refreshes, 1)
  const longCall = server.callEvents[0]!
  assert(longCall.acceptedAt < longCall.tokenExpiresAt)
  assert(longCall.completedAt! > longCall.tokenExpiresAt)
  assert.equal(server.state.registrations, mode === 'cimd' ? 0 : 1)
})
test('callback rejects wrong state and duplicate delivery', async t => {
  const callback = await reserveCallback(t)
  const redirect = callback.url; const receiver = await callback.receive(redirect, 'expected', new AbortController().signal)
  try {
    assert.equal((await fetch(`${redirect}?state=wrong&code=x`)).status, 400)
    assert.equal((await fetch(`${redirect}?state=expected&code=x`)).status, 200)
    assert.equal((await receiver.result).code, 'x')
    assert.equal((await fetch(`${redirect}?state=expected&code=x`)).status, 409)
  } finally { await receiver.close() }
})
test('callback cancellation releases port', async t => {
  const callback = await reserveCallback(t)
  const redirect = callback.url; const controller = new AbortController()
  const receiver = await callback.receive(redirect, 'expected', controller.signal)
  controller.abort(); await assert.rejects(receiver.result); await receiver.close()
  assert.equal(callback.server.listening, false)
})
test('changed OAuth identity does not reuse credentials', async () => {
  const config = serverSchema.parse({ id: 'test', label: 'Test', url: 'https://mcp.example.com/mcp' })
  const changed = { ...config, url: 'https://other.example.com/mcp' }
  const provider = new Provider(changed, { read: async () => ({ version: 1, binding: binding(config), tokens: { access_token: 'old', token_type: 'Bearer' } }), write: async () => {} })
  await provider.load(); assert.equal(provider.tokens(), undefined); await provider.stop()
})

test('repeated HTTP 401 refreshes once and never executes the tool', async t => {
  const callback = await reserveCallback(t)
  const server = await fixture(); t.after(() => server.close())
  const config = serverSchema.parse({ id: 'retry', label: 'Retry', url: server.origin + '/mcp', redirectUrl: callback.url })
  const provider = new Provider(config, { read: async () => undefined, write: async () => {} }, callback.receive); t.after(() => provider.stop())
  let approval: Promise<void> | undefined
  await provider.login(new AbortController().signal, url => { approval = approve(url) }); await approval
  const client = new Client({ name: 'test', version: '1' }); t.after(() => client.close())
  await client.connect(new StreamableHTTPClientTransport(new URL(config.url), { authProvider: provider.transportAuth }))
  server.state.rejectTokens = true
  await assert.rejects(client.callTool({ name: 'search', arguments: { query: 'reject' } }))
  assert.equal(server.state.refreshes, 1); assert.equal(server.state.calls, 0)
})
test('refresh failure asks for login without opening an authorization page', async t => {
  const callback = await reserveCallback(t)
  const server = await fixture(); t.after(() => server.close()); server.state.tokenSeconds = 30
  const config = serverSchema.parse({ id: 'retry', label: 'Retry', url: server.origin + '/mcp', redirectUrl: callback.url })
  const provider = new Provider(config, { read: async () => undefined, write: async () => {} }, callback.receive); t.after(() => provider.stop())
  let approvals = 0; let approval: Promise<void> | undefined
  await provider.login(new AbortController().signal, url => { approvals++; approval = approve(url) }); await approval
  server.state.refreshFails = true
  await assert.rejects(provider.transportAuth.token())
  assert.equal(approvals, 1)
})
test('a tool timeout does not replay the accepted request', async t => {
  const callback = await reserveCallback(t)
  const server = await fixture(); t.after(() => server.close())
  const config = serverSchema.parse({ id: 'timeout', label: 'Timeout', url: server.origin + '/mcp', redirectUrl: callback.url })
  const provider = new Provider(config, { read: async () => undefined, write: async () => {} }, callback.receive); t.after(() => provider.stop())
  let approval: Promise<void> | undefined
  await provider.login(new AbortController().signal, url => { approval = approve(url) }); await approval
  const client = new Client({ name: 'test', version: '1' }); t.after(() => client.close())
  await client.connect(new StreamableHTTPClientTransport(new URL(config.url), { authProvider: provider.transportAuth }))
  await assert.rejects(client.callTool({ name: 'delayed_echo', arguments: { message: 'late', delayMs: 300 } }, { timeout: 30 }))
  assert.equal(server.state.calls, 1)
})
test('callback port conflicts fail without choosing another redirect', async t => {
  const callback = await reserveCallback(t)
  const redirect = callback.url
  const first = await callback.receive(redirect, 'one', new AbortController().signal)
  try { await assert.rejects(listenCallback(redirect, 'two', new AbortController().signal), /OAUTH_CALLBACK_UNAVAILABLE/) }
  finally { await first.close() }
})
test('denial and cancellation settle and close the callback receiver', async t => {
  const callback = await reserveCallback(t)
  const redirect = callback.url
  const receiver = await callback.receive(redirect, 'expected', new AbortController().signal)
  await fetch(`${redirect}?state=expected&error=access_denied`)
  await assert.rejects(receiver.result, /OAUTH_DENIED/); await receiver.close()
})

test('CIMD rejects mismatched document identity and callback before consent', async t => {
  const callback = await reserveCallback(t)
  const metadata = await metadataHost(callback.url); t.after(() => metadata.close())
  const server = await fixture({ cimd: metadata }); t.after(() => server.close())
  const url = new URL('/authorize', server.origin)
  url.search = new URLSearchParams({ client_id: metadata.url, redirect_uri: callback.url, response_type: 'code', code_challenge: 'test', code_challenge_method: 'S256' }).toString()
  metadata.document.client_id = 'https://other.example.com/client.json'
  assert.equal((await fetch(url)).status, 400)
  metadata.document.client_id = metadata.url
  metadata.document.redirect_uris = ['http://127.0.0.1:1/other']
  assert.equal((await fetch(url)).status, 400)
  assert.equal(server.state.metadataRejected, 2)
  assert.equal(server.state.authorizations, 0)
  assert.equal(server.state.tokenExchanges, 0)
  assert.equal(server.state.registrations, 0)
})
