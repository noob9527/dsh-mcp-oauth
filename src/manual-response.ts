/** In-memory, one-use authorization response receiver; never opens a socket. */
import { timingSafeEqual } from 'node:crypto'
import type { Callback } from './callback.ts'
import { OAuthMcpError, cancelled } from './errors.ts'

export class ManualResponse implements Callback {
  readonly result: Callback['result']
  private settled = false
  private resolve!: (response: { code: string; iss?: string }) => void
  private reject!: (error: Error) => void
  private readonly abort = () => { this.settled = true; this.reject(cancelled()) }
  constructor(private readonly redirect: string, private readonly state: string, private readonly signal: AbortSignal) {
    signal.throwIfAborted()
    this.result = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject })
    void this.result.catch(() => { /* The login owner awaits the result after discovery. */ })
    signal.addEventListener('abort', this.abort, { once: true })
  }
  /**
   * Validate a full callback URL without fetching it; malformed input leaves the attempt pending.
   * @param response - Sensitive browser callback URL, never persisted or echoed.
   * @param issuer - Discovered authorization server issuer, if available.
   */
  submit(response: string, issuer?: string): void {
    if (this.settled || this.signal.aborted) throw new OAuthMcpError('OAUTH_RESPONSE_INACTIVE')
    const invalid = () => new OAuthMcpError('OAUTH_RESPONSE_INVALID')
    if (response.length > 16384) throw invalid()
    let url: URL
    try { url = new URL(response.trim()) } catch { throw invalid() }
    const target = new URL(this.redirect)
    const params = url.searchParams
    const expected = Buffer.from(this.state)
    const supplied = Buffer.from(params.get('state') ?? '')
    const allowed = ['code', 'state', 'iss', 'error', 'error_description', 'error_uri']
    if (url.origin !== target.origin || url.pathname !== target.pathname || url.username || url.password || url.hash ||
      [...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1) ||
      supplied.length !== expected.length || !timingSafeEqual(supplied, expected) ||
      params.has('code') === params.has('error') ||
      !(params.get('code') || params.get('error')) ||
      params.has('iss') && (!params.get('iss') || issuer !== undefined && params.get('iss') !== issuer)) throw invalid()
    this.settled = true
    if (params.has('error')) this.reject(new OAuthMcpError('OAUTH_DENIED'))
    else this.resolve({ code: params.get('code')!, ...(params.has('iss') ? { iss: params.get('iss')! } : {}) })
  }
  /** Invalidate the attempt and release its cancellation listener. */
  async close(): Promise<void> {
    this.signal.removeEventListener('abort', this.abort)
    this.abort()
  }
}
