/** Manual OAuth delivery retains PKCE and state without a network listener. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { ManualResponse } from '../src/manual-response.ts'
import { Provider } from '../src/provider.ts'
import { serverSchema } from '../src/config.ts'
import { fixture } from './fixture.ts'
import { metadataHost } from './cimd-document.ts'

const redirect = 'https://callback.example.com/oauth/response'
const response = (query: string) => `${redirect}?${query}`
const errorCode = (code: string) => (error: unknown) => error instanceof Error && error.message === code

import { authorizationResponse } from './manual-consent.ts'

test('manual response validates exact destination, singleton fields, issuer and state without consuming invalid input', async t => {
  const receiver = new ManualResponse(redirect, 'state-1', new AbortController().signal)
  t.after(() => receiver.close())
  const valid = response('code=code-1&state=state-1&iss=https%3A%2F%2Fissuer.example.com')
  for (const value of [
    'code-1', 'Authorization successful', 'a'.repeat(16385),
    valid.replace('callback.example.com', 'wrong.example.com'), valid.replace('/oauth/response', '/other'),
    valid.replace('https://callback', 'http://callback'), valid.replace('https://callback', 'https://user:password@callback'),
    valid + '#fragment', valid + '&code=another', valid + '&state=state-1', valid + '&iss=https://issuer.example.com',
    valid + '&access_token=never-accept', valid + '&error=access_denied',
    response('code=code-1&state=wrong'), response('code=code-1'), response('state=state-1'), response('code=&state=state-1'),
    response('code=code-1&state=state-1&iss=https://wrong.example.com'),
  ]) assert.throws(() => receiver.submit(value, 'https://issuer.example.com'), errorCode('OAUTH_RESPONSE_INVALID'))
  receiver.submit('  ' + valid + '\n', 'https://issuer.example.com')
  assert.deepEqual(await receiver.result, { code: 'code-1', iss: 'https://issuer.example.com' })
  assert.throws(() => receiver.submit(valid), errorCode('OAUTH_RESPONSE_INACTIVE'))
})

test('manual denial is consumed once and does not echo the upstream description', async t => {
  const receiver = new ManualResponse(redirect, 'state-1', new AbortController().signal)
  t.after(() => receiver.close())
  receiver.submit(response('error=access_denied&state=state-1&error_description=sensitive-description'))
  await assert.rejects(receiver.result, errorCode('OAUTH_DENIED'))
  assert.throws(() => receiver.submit(response('code=late&state=state-1')), errorCode('OAUTH_RESPONSE_INACTIVE'))
})
for (const mode of ['cancel', 'timeout', 'close'] as const) test(`manual ${mode} invalidates pending responses`, async t => {
  const controller = new AbortController()
  const receiver = new ManualResponse(redirect, 'state-1', mode === 'timeout' ? AbortSignal.timeout(30) : controller.signal)
  t.after(() => receiver.close())
  const rejected = assert.rejects(receiver.result, { name: 'AbortError' })
  if (mode === 'cancel') controller.abort()
  if (mode === 'close') await receiver.close()
  // Keep a bounded event-loop handle while the unref'ed timeout signal is pending.
  const guard = setTimeout(() => controller.abort(), 5000)
  try { await rejected } finally { clearTimeout(guard) }
  assert.throws(() => receiver.submit(response('code=late&state=state-1')), errorCode('OAUTH_RESPONSE_INACTIVE'))
})

test('manual mode accepts registered HTTPS or loopback callbacks, but not tokens or arbitrary HTTP', () => {
  const base = { id: 'manual', label: 'Manual', url: 'https://mcp.example.com/mcp', callbackMode: 'manual' }
  for (const redirectUrl of [redirect, 'http://127.0.0.1:6274/oauth/callback']) assert(serverSchema.safeParse({ ...base, redirectUrl }).success)
  for (const redirectUrl of ['http://callback.example.com/oauth/response', redirect + '?fixed=1', redirect + '#fragment']) assert(!serverSchema.safeParse({ ...base, redirectUrl }).success)
})

for (const mode of ['cimd', 'dcr', 'preregistered'] as const) test(`manual ${mode}: exchange once, search, refresh and reuse credentials after restart`, async t => {
  const metadata = mode === 'cimd' ? await metadataHost(redirect) : undefined
  if (metadata) t.after(() => metadata.close())
  const server = await fixture({ cimd: metadata }); t.after(() => server.close())
  let saved: unknown
  const store = { read: async () => saved, write: async (value: unknown) => { saved = structuredClone(value) } }
  const config = serverSchema.parse({ id: 'manual', label: 'Manual', url: server.origin + '/mcp', callbackMode: 'manual', redirectUrl: redirect, mode, metadataUrl: metadata?.url ?? '', clientId: mode === 'preregistered' ? 'test-client' : '' })
  const noListener = async (): Promise<never> => { throw new Error('Manual login must not start a listener') }
  const provider = new Provider(config, store, noListener, server.now); t.after(() => provider.stop())
  let notify!: (url: string) => void
  const notified = new Promise<string>(resolve => { notify = resolve })
  const login = provider.login(new AbortController().signal, notify); void login.catch(() => {})
  const url = await notified
  assert.equal(new URL(url).searchParams.get('code_challenge_method'), 'S256')
  const callback = await authorizationResponse(url)
  provider.submitResponse(callback)
  assert.throws(() => provider.submitResponse(callback), errorCode('OAUTH_RESPONSE_INACTIVE'))
  await login
  assert(provider.authorized); assert.equal(server.state.tokenExchanges, 1)
  assert.equal(server.state.metadataValidated, mode === 'cimd' ? 1 : 0)
  const code = new URL(callback).searchParams.get('code')!
  assert(!JSON.stringify(saved).includes(code)); assert(!JSON.stringify(saved).includes(callback))
  await provider.stop()
  const restarted = new Provider(config, store, noListener, server.now); t.after(() => restarted.stop())
  await restarted.load(); server.advanceTime(3_600_001)
  assert.throws(() => restarted.submitResponse(callback), errorCode('OAUTH_RESPONSE_INACTIVE'))
  const client = new Client({ name: 'manual-test', version: '1' }); t.after(() => client.close())
  await client.connect(new StreamableHTTPClientTransport(new URL(config.url), { authProvider: restarted.transportAuth }))
  assert.match(JSON.stringify(await client.callTool({ name: 'search', arguments: { query: 'manual' } })), /document-1/)
  assert.equal(server.state.calls, 1); assert.equal(server.state.refreshes, 1); assert.equal(server.state.authorizations, 1)
})

test('a manually pasted response cannot complete another attempt or service', async t => {
  const first = new ManualResponse(redirect, 'first', new AbortController().signal)
  const second = new ManualResponse(redirect, 'second', new AbortController().signal)
  t.after(() => first.close()); t.after(() => second.close())
  assert.throws(() => second.submit(response('code=first-code&state=first')), errorCode('OAUTH_RESPONSE_INVALID'))
  await first.close()
  assert.throws(() => first.submit(response('code=first-code&state=first')), errorCode('OAUTH_RESPONSE_INACTIVE'))
  second.submit(response('code=second-code&state=second'))
  assert.deepEqual(await second.result, { code: 'second-code' })
})
