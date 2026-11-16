/** HTTPS ingress forwarding to an instance-owned loopback OAuth receiver. */
import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { createServer as httpsServer, request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { reserveCallback } from './callback-reservation.ts'
import { listenCallback } from '../src/callback.ts'
import { serverSchema } from '../src/config.ts'
import { Provider } from '../src/provider.ts'
import { fixture } from './fixture.ts'
import { metadataHost } from './cimd-document.ts'

async function ingress(t: TestContext, upstream: string) {
  const root = await mkdtemp(join(tmpdir(), 'mcp-ingress-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(root, 'key.pem'), '-out', join(root, 'cert.pem'), '-days', '1', '-subj', '/CN=dsh.example.com', '-addext', 'subjectAltName=DNS:dsh.example.com'], { stdio: 'ignore' })
  const ca = await readFile(join(root, 'cert.pem'))
  const server = httpsServer({ key: await readFile(join(root, 'key.pem')), cert: ca }, (req, res) => {
    const outgoing = httpRequest(new URL(upstream), { method: req.method, path: req.url, headers: req.headers }, incoming => {
      res.writeHead(incoming.statusCode!, incoming.headers); incoming.pipe(res)
    })
    outgoing.on('error', () => { res.writeHead(502).end('Callback unavailable') })
    req.pipe(outgoing)
  })
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert(address && typeof address !== 'string')
  const port = address.port
  const origin = `https://dsh.example.com:${port}`
  function get(url: string, headers: Record<string, string> = {}, method = 'GET') {
    return new Promise<{ status: number; body: string; headers: import('node:http').IncomingHttpHeaders }>((resolve, reject) => {
      const target = new URL(url)
      assert.equal(target.origin, origin)
      const req = httpsRequest({ hostname: '127.0.0.1', port, path: target.pathname + target.search, servername: 'dsh.example.com', ca, rejectUnauthorized: true, method, headers: { host: target.host, ...headers } }, res => {
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(Buffer.from(chunk)))
        res.on('error', reject)
        res.on('end', () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString(), headers: res.headers }))
      })
      req.setTimeout(5000, () => req.destroy(new Error('Ingress request timeout')))
      req.on('error', reject); req.end()
    })
  }
  return { url: origin + '/u/alice/oauth/mcp/callback', get }
}

test('remote configuration requires HTTPS and preserves old local defaults', () => {
  const base = { id: 'test', label: 'Test', url: 'https://mcp.example.com/mcp' }
  assert.equal(serverSchema.parse(base).callbackMode, 'local')
  for (const redirectUrl of ['bad', 'http://dsh.example.com/callback', 'https://dsh.example.com/', 'https://dsh.example.com/callback?x=1', 'https://dsh.example.com/callback#x', 'https://user:secret@dsh.example.com/callback', 'https://localhost/callback']) {
    assert.equal(serverSchema.safeParse({ ...base, callbackMode: 'remote', redirectUrl }).success, false)
  }
  assert(!serverSchema.safeParse({ ...base, callbackMode: 'local', redirectUrl: 'https://dsh.example.com/callback' }).success)
  assert(!serverSchema.safeParse({ ...base, callbackMode: 'remote', callbackPort: 0, redirectUrl: 'https://dsh.example.com/callback' }).success)
  assert(serverSchema.safeParse({ ...base, callbackMode: 'remote', redirectUrl: 'https://dsh.example.com/u/alice/callback' }).success)
})

test('HTTPS proxy preserves exact callback authority, path and one-use state', async t => {
  const socket = await reserveCallback(t)
  const proxy = await ingress(t, socket.url)
  const controller = new AbortController()
  const receiver = await listenCallback(proxy.url, 'expected-state', controller.signal, socket.server, Number(new URL(socket.url).port))
  t.after(() => receiver.close())
  for (const query of ['code=x&state=wrong', 'code=x&state=expected-state&state=expected-state', 'code=x&code=y&state=expected-state', 'code=x&error=no&state=expected-state', 'code=&state=expected-state']) {
    assert.equal((await proxy.get(proxy.url + '?' + query)).status, 400)
  }
  const valid = proxy.url + '?code=accepted&state=expected-state'
  assert.equal((await proxy.get(valid, {}, 'POST')).status, 400)
  assert.equal((await proxy.get(valid.replace('/u/alice/', '/u/bob/'))).status, 400)
  assert.equal((await proxy.get(valid, { host: 'wrong.example', 'x-forwarded-host': new URL(proxy.url).host })).status, 400)
  const response = await proxy.get(valid)
  assert.equal(response.status, 200)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.equal(response.headers['referrer-policy'], 'no-referrer')
  assert(!response.body.includes('accepted')); assert(!response.body.includes('expected-state'))
  assert.deepEqual(await receiver.result, { code: 'accepted' })
  assert.equal((await proxy.get(valid)).status, 409)
  await receiver.close()
  assert.equal(socket.server.listening, false)
})

for (const action of ['cancel', 'timeout'] as const) test(`remote ${action} closes listener and rejects late callbacks`, async t => {
  const socket = await reserveCallback(t)
  const proxy = await ingress(t, socket.url)
  const controller = new AbortController()
  const signal = action === 'timeout' ? AbortSignal.timeout(50) : controller.signal
  const receiver = await listenCallback(proxy.url, 'pending', signal, socket.server)
  t.after(() => receiver.close())
  const rejected = assert.rejects(receiver.result, { name: 'AbortError' })
  if (action === 'cancel') controller.abort()
  await rejected; await receiver.close()
  assert.equal((await proxy.get(proxy.url + '?code=late&state=pending')).status, 502)
})

test('remote CIMD: HTTPS callback, PKCE exchange, tool call, refresh and restarted grant reuse', async t => {
  const socket = await reserveCallback(t)
  const proxy = await ingress(t, socket.url)
  const metadata = await metadataHost(proxy.url); t.after(() => metadata.close())
  const server = await fixture({ cimd: metadata }); t.after(() => server.close())
  let saved: unknown
  const store = { read: async () => saved, write: async (value: unknown) => { saved = structuredClone(value) } }
  const config = serverSchema.parse({ id: 'remote', label: 'Remote', url: server.origin + '/mcp', mode: 'cimd', metadataUrl: metadata.url, callbackMode: 'remote', callbackPort: Number(new URL(socket.url).port), redirectUrl: proxy.url })
  let listenPort: number | undefined
  const provider = new Provider(config, store, (url, state, signal, _reserved, port) => {
    listenPort = port
    return listenCallback(url, state, signal, socket.server, port)
  }, server.now)
  t.after(() => provider.stop())
  let notify!: (url: string) => void
  const notified = new Promise<string>(resolve => { notify = resolve })
  const login = provider.login(new AbortController().signal, notify)
  const loginResult = login.catch(error => { throw error }); void loginResult.catch(() => {})
  const url = await notified
  const query = new URL(url).searchParams
  assert.equal(query.get('redirect_uri'), proxy.url)
  assert.equal(query.get('client_id'), metadata.url)
  assert.equal(query.get('code_challenge_method'), 'S256')
  assert.equal(listenPort, config.callbackPort)
  const html = await (await fetch(url)).text()
  const link = html.match(/href="([^"]+)"/)?.[1]; assert(link)
  const consent = await fetch(new URL(link, url), { redirect: 'manual' })
  const destination = consent.headers.get('location'); assert(destination)
  assert.equal((await proxy.get(destination)).status, 200)
  await loginResult
  assert(provider.authorized)
  assert.equal(server.state.registrations, 0)
  assert.equal(server.state.metadataValidated, 1)
  assert.equal(server.state.tokenExchanges, 1)
  assert.equal(socket.server.listening, false)
  await provider.stop()
  const restarted = new Provider(config, store, socket.receive, server.now); t.after(() => restarted.stop())
  await restarted.load()
  server.advanceTime(3_600_001)
  const client = new Client({ name: 'remote-test', version: '1' }); t.after(() => client.close())
  await client.connect(new StreamableHTTPClientTransport(new URL(config.url), { authProvider: restarted.transportAuth }))
  assert.match(JSON.stringify(await client.callTool({ name: 'search', arguments: { query: 'remote' } })), /document-1/)
  assert.equal(server.state.calls, 1); assert.equal(server.state.refreshes, 1)
  assert.equal(server.state.authorizations, 1)
})

test('remote listener uses the configured port and fails closed when occupied', async t => {
  const socket = await reserveCallback(t)
  const config = serverSchema.parse({ id: 'occupied', label: 'Occupied', url: 'https://mcp.example.com/mcp', callbackMode: 'remote', callbackPort: Number(new URL(socket.url).port), redirectUrl: 'https://dsh.example.com/u/alice/oauth/mcp/callback' })
  const provider = new Provider(config, { read: async () => undefined, write: async () => { assert.fail('No grant should be written') } })
  t.after(() => provider.stop())
  await assert.rejects(provider.login(new AbortController().signal, () => assert.fail('No browser should open')), (error: unknown) => error instanceof Error && error.message === 'OAUTH_CALLBACK_UNAVAILABLE')
  assert.equal(socket.server.listening, true)
})

test('a response routed to another personal instance cannot complete its login', async t => {
  const aliceSocket = await reserveCallback(t)
  const bobSocket = await reserveCallback(t)
  const alice = await ingress(t, aliceSocket.url)
  const bob = await ingress(t, bobSocket.url)
  const first = await listenCallback(alice.url, 'alice-state', new AbortController().signal, aliceSocket.server)
  const second = await listenCallback(bob.url, 'bob-state', new AbortController().signal, bobSocket.server)
  t.after(() => first.close()); t.after(() => second.close())
  assert.equal((await bob.get(bob.url + '?code=alice-code&state=alice-state')).status, 400)
  assert.equal((await bob.get(bob.url + '?code=bob-code&state=bob-state')).status, 200)
  assert.deepEqual(await second.result, { code: 'bob-code' })
  assert.equal((await alice.get(alice.url + '?code=alice-code&state=alice-state')).status, 200)
  assert.deepEqual(await first.result, { code: 'alice-code' })
})
