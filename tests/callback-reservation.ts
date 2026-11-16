/** Atomically reserve a real callback socket and transfer it to the receiver. */
import { createServer } from 'node:http'
import type { TestContext } from 'node:test'
import { listenCallback } from '../src/callback.ts'

export async function reserveCallback(t: TestContext) {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Callback socket was not assigned')
  return { url: `http://127.0.0.1:${address.port}/oauth/callback`, server,
    receive: (url: string, state: string, signal: AbortSignal) => listenCallback(url, state, signal, server) }
}
