import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oauthDiagnostic } from '../src/diagnostics.ts'
import { Provider } from '../src/provider.ts'
import { serverSchema } from '../src/config.ts'

const secret = 'private-token-code-cookie-secret'
test('Host diagnostic keeps nested proxy classification without arbitrary data', () => {
  const cause = Object.assign(new Error(`Proxy response (403) !== 200 when HTTP Tunneling ${secret} https://internal.example/path?code=${secret}`), { code: 'UND_ERR_ABORTED', headers: { Authorization: secret } })
  const error = new TypeError(secret, { cause: new Error(secret, { cause }) })
  const record = oauthDiagnostic('private-service.example', 'resource_challenge', error)
  assert.equal(record.causes[2]?.reason, 'proxy_tunnel_rejected')
  assert.equal(record.causes[2]?.status, 403)
  assert.equal(record.causes[2]?.code, 'UND_ERR_ABORTED')
  assert(!JSON.stringify(record).includes(secret))
  assert(!JSON.stringify(record).includes('example'))
  assert(!JSON.stringify(record).includes('stack'))
})
test('untrusted names, codes, cyclic causes and aggregate children are bounded', () => {
  const child = { name: secret, code: secret, message: secret, cause: {} }
  child.cause = child
  const record = oauthDiagnostic('id', 'token_exchange', new AggregateError(Array(20).fill(child), secret))
  assert.equal(record.causes.length, 2)
  assert.equal(record.causes[1]?.type, 'UnknownError')
  assert(!JSON.stringify(record).includes(secret))
  assert.equal(oauthDiagnostic('id', 'refresh', { status: 401, code: 'invalid_grant' }).causes[0]?.status, 401)
})
test('actual login failure emits one Host record and preserves original rejection', async t => {
  const logs: string[] = []
  t.mock.method(console, 'warn', (line: string) => logs.push(line))
  const failure = Object.assign(new Error(secret), { code: 'EADDRINUSE' })
  const provider = new Provider(serverSchema.parse({ id: 'test', label: secret, url: 'https://mcp.example.com/mcp' }),
    { read: async () => undefined, write: async () => {} }, async () => { throw failure })
  t.after(() => provider.stop())
  await assert.rejects(provider.login(new AbortController().signal, () => {}), error => error === failure)
  assert.equal(logs.length, 1)
  assert.equal(JSON.parse(logs[0]!).stage, 'callback_setup')
  assert.equal(JSON.parse(logs[0]!).causes[0].code, 'EADDRINUSE')
  assert(!logs[0]!.includes(secret))
})
test('actual resource request failure emits the network stage without leaking its URL', async t => {
  const logs: string[] = []
  t.mock.method(console, 'warn', (line: string) => logs.push(line))
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError(secret, { cause: Object.assign(new Error(secret), { code: 'ENOTFOUND' }) }) })
  const provider = new Provider(serverSchema.parse({ id: 'test', label: secret, url: 'https://mcp.example.com/mcp', callbackMode: 'manual' }),
    { read: async () => undefined, write: async () => {} })
  t.after(() => provider.stop())
  await assert.rejects(provider.login(new AbortController().signal, () => {}))
  assert.equal(logs.length, 1)
  assert.equal(JSON.parse(logs[0]!).stage, 'resource_challenge')
  assert.equal(JSON.parse(logs[0]!).causes[1].code, 'ENOTFOUND')
  assert(!logs[0]!.includes(secret))
  assert(!logs[0]!.includes('example.com'))
})

test('SDK OAuth reasons remain classified while server descriptions are omitted', async () => {
  const { OAuthError } = await import('@modelcontextprotocol/client')
  const record = oauthDiagnostic('id', 'token_exchange', new OAuthError('invalid_grant', secret))
  assert.equal(record.causes[0]?.type, 'OAuthError')
  assert.equal(record.causes[0]?.code, 'invalid_grant')
  assert(!JSON.stringify(record).includes(secret))
})
test('credential persistence failure reports its stage and refresh failure stays Host-only', async t => {
  const { fixture, approve } = await import('./fixture.ts')
  const { reserveCallback } = await import('./callback-reservation.ts')
  const callback = await reserveCallback(t)
  const server = await fixture(); t.after(() => server.close())
  const logs: string[] = []
  t.mock.method(console, 'warn', (line: string) => logs.push(line))
  const provider = new Provider(serverSchema.parse({ id: 'test', label: 'Test', url: server.origin + '/mcp', redirectUrl: callback.url }),
    { read: async () => undefined, write: async () => { throw Object.assign(new Error(secret), { code: 'EACCES' }) } }, callback.receive)
  t.after(() => provider.stop())
  await assert.rejects(provider.login(new AbortController().signal, url => { void approve(url) }))
  assert.equal(logs.length, 1)
  assert.equal(JSON.parse(logs[0]!).stage, 'credential_persistence')
  assert.equal(JSON.parse(logs[0]!).causes[0].code, 'EACCES')
  await assert.rejects(provider.transportAuth.onUnauthorized!({ response: new Response(null, { status: 401 }) } as Parameters<NonNullable<typeof provider.transportAuth.onUnauthorized>>[0]))
  assert.equal(logs.length, 2)
  assert.equal(JSON.parse(logs[1]!).stage, 'refresh')
  assert(!logs.join('').includes(secret))
})
