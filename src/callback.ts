/** One-attempt loopback receiver; a callback is not a successful token exchange. */
import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { OAuthMcpError, cancelled } from './errors.ts'

export interface Callback {
  result: Promise<{ code: string; iss?: string }>
  close(): Promise<void>
}
export async function listenCallback(redirect: string, state: string, signal: AbortSignal, reserved?: Server): Promise<Callback> {
  signal.throwIfAborted()
  const target = new URL(redirect)
  let resolve!: (value: { code: string; iss?: string }) => void
  let reject!: (reason: Error) => void
  let received = false
  const result = new Promise<{ code: string; iss?: string }>((yes, no) => { resolve = yes; reject = no })
  // The owner may still be awaiting discovery when the user cancels.
  void result.catch(() => {})
  const server = reserved ?? createServer()
  const handle = (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('Referrer-Policy', 'no-referrer')
    response.setHeader('Content-Security-Policy', "default-src 'none'")
    const url = new URL(request.url ?? '/', target.origin)
    const supplied = Buffer.from(url.searchParams.get('state') ?? '')
    const expected = Buffer.from(state)
    if (request.method !== 'GET' || request.headers.host !== target.host || url.pathname !== target.pathname ||
      supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      response.writeHead(400).end('Invalid authorization callback.'); return
    }
    if (received) { response.writeHead(409).end('Callback already received.'); return }
    if (!url.searchParams.has('code') && !url.searchParams.has('error')) {
      response.writeHead(400).end('Missing authorization response.'); return
    }
    received = true
    if (url.searchParams.has('error')) {
      reject(new OAuthMcpError('OAUTH_DENIED'))
      response.writeHead(400).end('Authorization declined. Return to DSH.'); return
    }
    resolve({ code: url.searchParams.get('code')!, ...(url.searchParams.has('iss') ? { iss: url.searchParams.get('iss')! } : {}) })
    response.end('Authorization response received. Return to DSH to check completion.')
  }
  server.on('request', handle)
  const abort = () => { reject(cancelled()); server.close(); server.closeAllConnections() }
  signal.addEventListener('abort', abort, { once: true })
  try {
    if (!server.listening) await new Promise<void>((yes, no) => {
      server.once('error', no)
      server.listen(Number(target.port), '127.0.0.1', () => { server.removeListener('error', no); yes() })
    })
    signal.throwIfAborted()
  } catch {
    signal.removeEventListener('abort', abort)
    server.removeListener('request', handle)
    server.close()
    throw new OAuthMcpError(signal.aborted ? 'OAUTH_CANCELLED' : 'OAUTH_CALLBACK_UNAVAILABLE')
  }
  return { result, async close() {
    signal.removeEventListener('abort', abort)
    server.removeListener('request', handle)
    reject(cancelled())
    server.closeAllConnections()
    await new Promise<void>(yes => server.close(() => yes()))
  } }
}
