/** HTTPS metadata host with a per-run certificate trusted only by the fixture. */
import { createServer, get } from 'node:https'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

export async function metadataHost(redirectUrl: string) {
  const root = await mkdtemp(join(tmpdir(), 'mcp-cimd-'))
  let server: ReturnType<typeof createServer> | undefined
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(root, 'key.pem'), '-out', join(root, 'cert.pem'), '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' })
    const ca = await readFile(join(root, 'cert.pem'))
    let url = ''
    const state = { fetches: 0 }
    const document = { client_id: '', client_name: 'Local CIMD test client', application_type: 'native', redirect_uris: [redirectUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }
    server = createServer({ key: await readFile(join(root, 'key.pem')), cert: ca }, (req, res) => {
      if (req.url !== '/client.json') { res.writeHead(404).end(); return }
      state.fetches++
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(document))
    })
    await new Promise<void>((resolve, reject) => { server!.once('error', reject); server!.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing metadata port')
    url = `https://127.0.0.1:${address.port}/client.json`; document.client_id = url
    return { url, ca, document, state, async close() { server!.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); await rm(root, { recursive: true, force: true }) } }
  } catch (error) { server?.close(); await rm(root, { recursive: true, force: true }); throw error }
}

/** Fetch only the fixture-owned HTTPS endpoint, retaining certificate verification. */
export function readMetadata(url: string, ca: Buffer): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = get(url, { ca, rejectUnauthorized: true, timeout: 5000 }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Metadata HTTP failure')); return }
      const chunks: Buffer[] = []; let size = 0
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 65536) request.destroy(new Error('Metadata too large')); else chunks.push(chunk) })
      response.on('error', reject)
      response.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())) } catch (error) { reject(error) } })
    })
    request.on('timeout', () => request.destroy(new Error('Metadata timeout')))
    request.on('error', reject)
  })
}
