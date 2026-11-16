/** SDK OAuth provider with isolated grants and single-flight refresh. */
import { randomBytes, createHash } from 'node:crypto'
import { auth, extractResourceMetadataUrl, type AuthProvider, type OAuthClientProvider, type OAuthClientInformationContext,
  type StoredOAuthClientInformation, type StoredOAuthTokens, type OAuthDiscoveryState } from '@modelcontextprotocol/client'
import { z } from 'zod'
import type { ServerConfig } from './config.ts'
import { OAuthMcpError } from './errors.ts'
import { listenCallback } from './callback.ts'

const tokensSchema = z.object({ access_token: z.string(), token_type: z.string(), refresh_token: z.string().optional(), expires_in: z.number().optional(), scope: z.string().optional(), issuer: z.string().optional() }).passthrough()
const clientSchema = z.object({ client_id: z.string(), client_secret: z.string().optional(), issuer: z.string().optional() }).passthrough()
const grantSchema = z.object({ version: z.literal(1), binding: z.string(), tokens: tokensSchema.optional(), client: clientSchema.optional(), expiresAt: z.number().optional(), issuer: z.string().optional(), secret: z.string().optional() })
type Grant = z.infer<typeof grantSchema>
export interface GrantStore {
  read(): Promise<unknown>
  write(value: Grant): Promise<void>
}
export function binding(config: ServerConfig): string {
  return createHash('sha256').update(JSON.stringify([config.url, config.mode, config.clientId, config.metadataUrl, config.redirectUrl, config.scope])).digest('hex')
}
export class Provider implements OAuthClientProvider {
  private grant: Grant
  private verifier = ''
  private discovery?: OAuthDiscoveryState
  private active?: { state: string; signal: AbortSignal; notify: (url: string) => void }
  private refresh?: Promise<void>
  private loginTask?: Promise<void>
  private stopped = false
  private writes: Promise<void> = Promise.resolve()
  private lifetime = new AbortController()
  readonly clientMetadataUrl?: string
  readonly saveClientInformation?: (value: StoredOAuthClientInformation, ctx?: OAuthClientInformationContext) => Promise<void>

  constructor(readonly config: ServerConfig, private readonly store: GrantStore, private readonly receiveCallback: typeof listenCallback = listenCallback, private readonly now: () => number = Date.now) {
    this.grant = { version: 1, binding: binding(config) }
    if (config.mode === 'cimd' || config.mode === 'auto' && !config.clientId && config.metadataUrl) this.clientMetadataUrl = config.metadataUrl
    {
      this.saveClientInformation = async (client, ctx) => {
        this.checkIssuer(ctx?.issuer ?? client.issuer)
        await this.persist({ ...this.grant, client, issuer: ctx?.issuer ?? client.issuer })
      }
    }
  }
  async load(): Promise<void> {
    const raw = await this.store.read()
    if (raw === undefined) return
    const parsed = grantSchema.safeParse(raw)
    if (!parsed.success) throw new OAuthMcpError('OAUTH_INVALID_GRANT_RECORD')
    if (parsed.data.binding === this.grant.binding) this.grant = parsed.data
  }
  get redirectUrl(): string { return this.config.redirectUrl }
  get clientMetadata() {
    return { client_name: 'DSH MCP OAuth', redirect_uris: [this.redirectUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: this.grant.secret ? 'client_secret_post' : 'none', ...(this.config.scope ? { scope: this.config.scope } : {}) }
  }
  state(): string { if (!this.active) throw new OAuthMcpError('OAUTH_LOGIN_REQUIRED'); return this.active.state }
  clientInformation(ctx?: OAuthClientInformationContext): StoredOAuthClientInformation | undefined {
    this.checkIssuer(ctx?.issuer)
    if (this.config.mode === 'preregistered' || this.config.mode === 'auto' && this.config.clientId) {
      return { client_id: this.config.clientId, ...(this.grant.secret ? { client_secret: this.grant.secret } : {}), ...(ctx ? { issuer: ctx.issuer } : {}) }
    }
    return this.grant.client
  }
  tokens(ctx?: OAuthClientInformationContext): StoredOAuthTokens | undefined { this.checkIssuer(ctx?.issuer); return this.grant.tokens }
  async saveTokens(tokens: StoredOAuthTokens, ctx?: OAuthClientInformationContext): Promise<void> {
    const issuer = ctx?.issuer ?? tokens.issuer
    this.checkIssuer(issuer)
    await this.persist({ ...this.grant, tokens, issuer: issuer ?? this.grant.issuer, expiresAt: tokens.expires_in === undefined ? undefined : this.now() + tokens.expires_in * 1000 })
  }
  async setSecret(secret: string): Promise<void> { await this.persist({ ...this.grant, secret: secret || undefined }) }
  async redirectToAuthorization(url: URL): Promise<void> {
    if (!this.active) throw new OAuthMcpError('OAUTH_LOGIN_REQUIRED')
    this.active.signal.throwIfAborted()
    this.active.notify(url.href)
  }
  saveCodeVerifier(value: string): void { this.verifier = value }
  codeVerifier(): string { if (!this.verifier) throw new OAuthMcpError('OAUTH_LOGIN_REQUIRED'); return this.verifier }
  saveDiscoveryState(value: OAuthDiscoveryState): void {
    if (this.config.mode === 'cimd' && value.authorizationServerMetadata?.client_id_metadata_document_supported !== true) throw new OAuthMcpError('OAUTH_CIMD_UNSUPPORTED')
    this.discovery = value
  }
  discoveryState(): OAuthDiscoveryState | undefined { return this.discovery }
  async invalidateCredentials(scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery'): Promise<void> {
    if (scope === 'verifier' || scope === 'all') this.verifier = ''
    if (scope === 'discovery' || scope === 'all') this.discovery = undefined
    await this.persist({ ...this.grant, ...(scope === 'all' || scope === 'tokens' ? { tokens: undefined, expiresAt: undefined } : {}), ...(scope === 'all' || scope === 'client' ? { client: undefined } : {}) })
  }
  get authorized(): boolean { return !!this.grant.tokens }
  private checkIssuer(issuer?: string): void {
    if (issuer && this.grant.issuer && issuer !== this.grant.issuer) throw new OAuthMcpError('OAUTH_ISSUER_CHANGED')
  }
  private persist(value: Grant): Promise<void> {
    const write = this.writes.then(async () => {
      if (this.stopped || this.active?.signal.aborted) throw new OAuthMcpError('OAUTH_CANCELLED')
      await this.store.write(value)
      this.grant = value
    })
    this.writes = write.catch(() => {})
    return write
  }
  private fetch: typeof fetch = (url, init) => fetch(url, { ...init, signal: AbortSignal.any([this.lifetime.signal, ...(this.active ? [this.active.signal] : []), AbortSignal.timeout(this.config.connectTimeoutMs), ...(init?.signal ? [init.signal] : [])]) })
  login(signal: AbortSignal, notify: (url: string) => void): Promise<void> {
    if (this.loginTask || this.stopped) return Promise.reject(new OAuthMcpError(this.stopped ? 'OAUTH_STOPPED' : 'OAUTH_BUSY'))
    this.loginTask = this.runLogin(signal, notify).finally(() => { this.loginTask = undefined })
    return this.loginTask
  }
  private async runLogin(signal: AbortSignal, notify: (url: string) => void): Promise<void> {
    if (this.active) throw new OAuthMcpError('OAUTH_BUSY')
    await this.refresh
    const lifetime = AbortSignal.any([signal, this.lifetime.signal, AbortSignal.timeout(this.config.authTimeoutMs)])
    this.active = { state: randomBytes(32).toString('hex'), signal: lifetime, notify }
    let callback: Awaited<ReturnType<typeof listenCallback>> | undefined
    try {
      callback = await this.receiveCallback(this.redirectUrl, this.active.state, lifetime)
      const challenge = await this.fetch(this.config.url, { method: 'GET' })
      const resourceMetadataUrl = extractResourceMetadataUrl(challenge)
      await challenge.body?.cancel()
      const result = await auth(this, { serverUrl: this.config.url, resourceMetadataUrl, scope: this.config.scope || undefined, forceReauthorization: true, fetchFn: this.fetch })
      if (result === 'REDIRECT') {
        const response = await callback.result
        lifetime.throwIfAborted()
        await auth(this, { serverUrl: this.config.url, authorizationCode: response.code, iss: response.iss, fetchFn: this.fetch })
      }
      lifetime.throwIfAborted()
      if (!this.grant.tokens) throw new OAuthMcpError('OAUTH_LOGIN_REQUIRED')
    } finally { await callback?.close(); this.active = undefined; this.verifier = '' }
  }
  private renew(resourceMetadataUrl?: URL): Promise<void> {
    if (this.active) return Promise.reject(new OAuthMcpError('OAUTH_BUSY'))
    if (!this.refresh) {
      this.refresh = (async () => {
        if (!this.grant.tokens?.refresh_token) throw new OAuthMcpError('OAUTH_LOGIN_REQUIRED')
        const result = await auth(this, { serverUrl: this.config.url, resourceMetadataUrl, fetchFn: this.fetch })
        if (result !== 'AUTHORIZED') throw new OAuthMcpError('OAUTH_LOGIN_REQUIRED')
      })().finally(() => { this.refresh = undefined })
    }
    return this.refresh
  }
  /** Transport owns the single HTTP retry; this adapter owns refresh serialization. */
  readonly transportAuth: AuthProvider = {
    token: async () => {
      if (this.grant.expiresAt !== undefined && this.grant.expiresAt - this.now() <= this.config.refreshSkewMs && this.grant.tokens?.refresh_token) await this.renew()
      return this.grant.tokens?.access_token
    },
    onUnauthorized: async context => { await this.renew(extractResourceMetadataUrl(context.response)) },
  }
  async stop(): Promise<void> {
    this.stopped = true; this.lifetime.abort()
    await this.loginTask?.catch(() => { /* Cancellation is reported by the authorization owner. */ })
    await this.refresh?.catch(() => { /* The request owner reports refresh failure. */ })
    await this.writes
  }
}
