/** Deterministic local OAuth + MCP server, never a production identity provider. */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { readMetadata } from './cimd-document.ts'

export async function fixture(options: { cimd?: { url: string; ca: Buffer }; audit?: boolean; tokenSeconds?: number } = {}) {
  const codes = new Map<string, URLSearchParams>()
  const requests = new Map<string, URLSearchParams>()
  const access = new Map<string, number>()
  const refresh = new Set<string>()
  const state = { metadataFetches: 0, metadataValidated: 0, metadataRejected: 0, authorizations: 0, tokenExchanges: 0, registrations: 0, refreshes: 0, calls: 0, tokenSeconds: options.tokenSeconds ?? 3600, rejectTokens: false, refreshFails: false, callDelayMs: 0 }
  const tokenEvents: { grantType: string; issuedAt: number; expiresAt: number }[] = []
  const callEvents: { name: string; acceptedAt: number; tokenExpiresAt: number; completedAt?: number }[] = []
  let offset = 0
  const now = () => Date.now() + offset
  let callGate: Promise<void> | undefined
  let callReceived: (() => void) | undefined
  let origin = ''
  const json = (res: ServerResponse, value: unknown, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)) }
  const body = async (req: IncomingMessage) => { const chunks = []; for await (const part of req) chunks.push(Buffer.from(part)); return Buffer.concat(chunks).toString() }
  const server = createServer((req, res) => { void (async () => {
    const url = new URL(req.url ?? '/', origin)
    if (options.audit && url.pathname === '/test-audit') return json(res, { ...state, tokenEvents, callEvents })
    if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return json(res, { resource: origin + '/mcp', authorization_servers: [origin], scopes_supported: ['tools'] })
    if (url.pathname === '/.well-known/oauth-authorization-server') return json(res, {
      issuer: origin, authorization_endpoint: origin + '/authorize', token_endpoint: origin + '/token', registration_endpoint: origin + '/register',
      response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post'], client_id_metadata_document_supported: true, scopes_supported: ['tools'],
    })
    if (url.pathname === '/register') { state.registrations++; return json(res, { ...JSON.parse(await body(req)), client_id: 'registered-' + state.registrations }, 201) }
    if (url.pathname === '/authorize') {
      const clientId = url.searchParams.get('client_id') ?? ''
      if (options.cimd || clientId.startsWith('https:')) {
        try {
          if (clientId !== options.cimd?.url) throw new Error('Unknown metadata endpoint')
          state.metadataFetches++
          const document = z.object({ client_id: z.literal(clientId), client_name: z.string().min(1), redirect_uris: z.array(z.string().url()).min(1), token_endpoint_auth_method: z.literal('none'), response_types: z.array(z.string()), grant_types: z.array(z.string()) }).parse(await readMetadata(clientId, options.cimd.ca))
          if (!document.redirect_uris.includes(url.searchParams.get('redirect_uri') ?? '') || !document.response_types.includes('code') || !document.grant_types.includes('authorization_code')) throw new Error('Invalid client metadata')
          state.metadataValidated++
        } catch { state.metadataRejected++; return json(res, { error: 'invalid_client_metadata' }, 400) }
      }
      if (url.searchParams.get('code_challenge_method') !== 'S256' || !url.searchParams.get('code_challenge')) return json(res, { error: 'invalid_request' }, 400)
      state.authorizations++
      const request = randomBytes(16).toString('hex'); requests.set(request, url.searchParams)
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' })
      res.end(`<html><body><h1>Local OAuth test service</h1><p>Allow access to deterministic test tools?</p><a href="/approve?request=${request}">Allow</a></body></html>`); return
    }
    if (url.pathname === '/approve') {
      const query = requests.get(url.searchParams.get('request') ?? '')
      if (!query) return json(res, { error: 'invalid_request' }, 400)
      requests.delete(url.searchParams.get('request')!)
      const code = randomBytes(16).toString('hex'); codes.set(code, query)
      const destination = new URL(query.get('redirect_uri')!)
      destination.searchParams.set('code', code); destination.searchParams.set('state', query.get('state')!)
      destination.searchParams.set('iss', origin)
      res.writeHead(302, { Location: destination.href }).end(); return
    }
    if (url.pathname === '/token') {
      const form = new URLSearchParams(await body(req))
      if (form.get('grant_type') === 'authorization_code') {
        const saved = codes.get(form.get('code') ?? '')
        if (!saved || saved.get('redirect_uri') !== form.get('redirect_uri') || saved.get('client_id') !== form.get('client_id') ||
          saved.get('code_challenge') !== createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url')) return json(res, { error: 'invalid_grant' }, 400)
        codes.delete(form.get('code')!); state.tokenExchanges++
      } else if (form.get('grant_type') === 'refresh_token') {
        if (state.refreshFails || !refresh.delete(form.get('refresh_token') ?? '')) return json(res, { error: 'invalid_grant' }, 400)
        state.refreshes++
      } else return json(res, { error: 'unsupported_grant_type' }, 400)
      const token = randomBytes(20).toString('hex'); const next = randomBytes(20).toString('hex')
      const issuedAt = now(); const expiresAt = issuedAt + state.tokenSeconds * 1000
      access.set(token, expiresAt); refresh.add(next)
      tokenEvents.push({ grantType: form.get('grant_type')!, issuedAt, expiresAt })
      return json(res, { access_token: token, refresh_token: next, token_type: 'Bearer', expires_in: state.tokenSeconds, scope: 'tools' })
    }
    if (url.pathname !== '/mcp') return json(res, { error: 'not_found' }, 404)
    const expires = access.get(req.headers.authorization?.replace(/^Bearer /, '') ?? '')
    if (state.rejectTokens || !expires || expires <= now()) {
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`)
      return json(res, { error: 'unauthorized' }, 401)
    }
    if (req.method !== 'POST') { res.writeHead(405).end(); return }
    const request = JSON.parse(await body(req))
    if (request.id === undefined) { res.writeHead(202).end(); return }
    let result: unknown
    if (request.method === 'initialize') result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: { listChanged: true } }, serverInfo: { name: 'local-test-mcp', version: '1.0.0' } }
    else if (request.method === 'tools/list') result = { tools: [
      { name: 'search', description: 'Search deterministic local test documents.', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
      { name: 'delayed_echo', description: 'Return a test message after a configurable delay.', inputSchema: { type: 'object', properties: { message: { type: 'string' }, delayMs: { type: 'number' } }, required: ['message'] } },
    ] }
    else if (request.method === 'tools/call') {
      state.calls++
      const call: typeof callEvents[number] = { name: request.params.name, acceptedAt: now(), tokenExpiresAt: expires }
      callEvents.push(call)
      callReceived?.()
      await callGate
      await delay(request.params.name === 'delayed_echo' ? Math.min(60_000, Math.max(0, request.params.arguments.delayMs ?? state.callDelayMs)) : state.callDelayMs)
      call.completedAt = now()
      result = { content: [{ type: 'text', text: request.params.name === 'search' ? JSON.stringify([{ id: 'document-1', title: 'OAuth MCP test document', query: request.params.arguments.query }]) : request.params.arguments.message }] }
    } else if (request.method === 'ping') result = {}
    else return json(res, { jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Unknown method' } })
    json(res, { jsonrpc: '2.0', id: request.id, result })
  })().catch(() => { if (!res.headersSent) json(res, { error: 'fixture_failure' }, 500); else res.end() }) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test port')
  origin = `http://127.0.0.1:${address.port}`
  return { origin, state, tokenEvents, callEvents, now, advanceTime(ms: number) { offset += ms },
    holdCalls() {
      let release!: () => void
      const received = new Promise<void>(resolve => { callReceived = resolve })
      callGate = new Promise<void>(resolve => { release = resolve })
      return { received, release }
    },
    async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } }
}

/** Complete the browser steps in protocol tests only. UI acceptance uses a real browser. */
export async function approve(url: string): Promise<void> {
  const response = await fetch(url)
  const html = await response.text()
  const link = html.match(/href="([^"]+)"/)?.[1]
  if (!link) throw new Error('Missing consent link')
  await fetch(new URL(link, url))
}
