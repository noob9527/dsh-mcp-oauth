import { test } from 'node:test'
import assert from 'node:assert/strict'
import { get } from 'node:http'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { listenCallback } from '../src/callback.ts'
import { Provider, binding } from '../src/provider.ts'
import { serverSchema } from '../src/config.ts'
import { metadataHost } from './cimd-document.ts'
import { fixture, approve, matchesRedirect } from './fixture.ts'

for (const host of ['127.0.0.1', 'localhost']) test(`${host}: automatic receivers use independent ports and close on cancellation`, async t => {
  const base = `http://${host}/oauth/callback`
  const first = await listenCallback(base, 'first', new AbortController().signal); t.after(() => first.close())
  const controller = new AbortController()
  const second = await listenCallback(base, 'second', controller.signal); t.after(() => second.close())
  assert(Number(new URL(first.redirectUrl).port) > 0)
  assert.notEqual(first.redirectUrl, second.redirectUrl)
  assert.equal(new URL(first.redirectUrl).hostname, host)
  assert.equal((await fetch(first.redirectUrl + '?state=wrong&code=x')).status, 400)
  const wrongPath = new URL(first.redirectUrl); wrongPath.pathname = '/wrong'; wrongPath.search = '?state=first&code=x'
  assert.equal((await fetch(wrongPath)).status, 400)
  const wrongHost = await new Promise<number | undefined>((resolve, reject) => {
    get(first.redirectUrl + '?state=first&code=x', { headers: { host: 'attacker.example' } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)) }).on('error', reject)
  })
  assert.equal(wrongHost, 400)
  assert.equal((await fetch(first.redirectUrl + '?state=first&code=x')).status, 200)
  assert.equal((await first.result).code, 'x')
  assert.equal((await fetch(first.redirectUrl + '?state=first&code=x')).status, 409)
  controller.abort(); await assert.rejects(second.result, { name: 'AbortError' })
  await second.close()
  await assert.rejects(fetch(second.redirectUrl))
})

for (const host of ['127.0.0.1', 'localhost']) for (const mode of ['cimd', 'dcr', 'preregistered'] as const) {
  test(`${mode} ${host}: dynamic callback exchanges tokens, refreshes and reuses grants after restart`, async t => {
    const redirectUrl = `http://${host}/oauth/callback`
    const metadata = mode === 'cimd' ? await metadataHost(redirectUrl) : undefined
    if (metadata) t.after(() => metadata.close())
    const server = await fixture({ cimd: metadata, tokenSeconds: 30 }); t.after(() => server.close())
    const config = serverSchema.parse({ id: 'dynamic', label: 'Dynamic', url: server.origin + '/mcp', redirectUrl, mode,
      metadataUrl: metadata?.url ?? '', clientId: mode === 'preregistered' ? 'test-client' : '' })
    let saved: unknown
    const store = { read: async () => saved, write: async (value: unknown) => { saved = structuredClone(value) } }
    const provider = new Provider(config, store); t.after(() => provider.stop())
    let approval: Promise<void> | undefined
    let actualRedirect = ''
    await provider.login(new AbortController().signal, url => {
      actualRedirect = new URL(url).searchParams.get('redirect_uri')!
      approval = approve(url)
    }); await approval
    assert.equal(new URL(actualRedirect).hostname, host)
    assert(Number(new URL(actualRedirect).port) > 0)
    assert.equal(config.redirectUrl, redirectUrl)
    assert.equal(provider.redirectUrl, redirectUrl)
    assert(saved && typeof saved === 'object' && 'binding' in saved)
    assert.equal(saved.binding, binding(config))
    assert.equal(server.state.tokenExchanges, 1)
    assert.equal(server.state.metadataValidated, mode === 'cimd' ? 1 : 0)
    await assert.rejects(fetch(actualRedirect))
    await provider.stop()
    const restarted = new Provider(config, store); t.after(() => restarted.stop()); await restarted.load()
    assert(restarted.authorized)
    await restarted.transportAuth.token()
    assert.equal(server.state.refreshes, 1)
    const client = new Client({ name: 'dynamic-test', version: '1' }); t.after(() => client.close())
    await client.connect(new StreamableHTTPClientTransport(new URL(config.url), { authProvider: restarted.transportAuth }))
    const result = await client.callTool({ name: 'search', arguments: { query: 'dynamic callback' } })
    assert.match(JSON.stringify(result), /document-1/)
    assert.equal(server.state.calls, 1)
    assert.equal(server.state.authorizations, 1)
  })
}

test('loopback matching ignores only native client ports', () => {
  const registered = 'http://127.0.0.1/oauth/callback'
  assert(matchesRedirect(registered, 'http://127.0.0.1:51004/oauth/callback', 'native'))
  for (const actual of ['http://localhost:51004/oauth/callback', 'http://127.0.0.1:51004/other', 'https://127.0.0.1:51004/oauth/callback', 'http://127.0.0.1:51004/oauth/callback?extra=1', 'http://attacker.example:51004/oauth/callback']) assert(!matchesRedirect(registered, actual, 'native'))
  assert(!matchesRedirect(registered, 'http://127.0.0.1:51004/oauth/callback', 'web'))
  assert(!matchesRedirect('https://client.example/callback', 'https://client.example:51004/callback', 'native'))
})
