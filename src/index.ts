/** Profile-local service configuration and authorization ownership. */
import { mkdir, readFile, rename, writeFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService, principalOf, Remote } from '@deepseek-ai/dsh-typert-protocol'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-authorization'
import type {} from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-typert-registry'
import type {} from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import { serverSchema, type ServerConfig, type ServerStatus, type Action } from './config.ts'
import { Provider } from './provider.ts'
import { Connection } from './connection.ts'
import { OAuthMcpError } from './errors.ts'
import { remoteInfo } from './remote.ts'
import { listenCallback } from './callback.ts'

declare module '@deepseek-ai/cordis' { interface Context { mcpOAuth: McpOAuth } }
type Entry = { provider: Provider; connection: Connection; status: ServerStatus; disposeFlow: () => void; attempt?: AbortController; login?: Promise<void> }
export const name = 'mcp-oauth'
export const inject = ['tools', 'authorization', 'credentials', 'profileContext', 'typert']
export class McpOAuth extends TypertRemoteService {
  private entries = new Map<string, Entry>()
  private tail = Promise.resolve()
  private closed = false
  private profile = ''
  private configFile = ''
  constructor(ctx: Context, private readonly receiveCallback: typeof listenCallback = listenCallback) { super(ctx, 'mcpOAuth') }
  async start(): Promise<void> {
    this.profile = await realpath(this.ctx.profileContext.dir)
    this.configFile = join(this.profile, 'mcp-oauth', 'servers.json')
    let values: ServerConfig[] = []
    try { values = z.array(serverSchema).parse(JSON.parse(await readFile(this.configFile, 'utf8'))) }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw new OAuthMcpError('OAUTH_CONFIG_UNREADABLE') }
    if (new Set(values.map(value => value.id)).size !== values.length) throw new OAuthMcpError('OAUTH_DUPLICATE_SERVER')
    for (const config of values) await this.mount(config)
  }
  private key(id: string) { return credentialKey('mcp-oauth', 'grant-' + createHash('sha256').update(JSON.stringify([this.profile, id])).digest('hex')) }
  private owner(): void {
    if (this.closed) throw new OAuthMcpError('OAUTH_STOPPED')
    if (!this.ctx.invocation || principalOf(this.ctx.invocation) !== undefined) throw new OAuthMcpError('OAUTH_OWNER_REQUIRED')
  }
  @Remote
  list(): ServerStatus[] { this.owner(); return [...this.entries.values()].map(entry => structuredClone(entry.status)) }
  private serialize(run: () => Promise<void>): Promise<void> {
    const task = this.tail.then(run)
    this.tail = task.catch(() => {})
    return task
  }
  @Remote
  async save(input: ServerConfig, secret?: string): Promise<null> {
    this.owner()
    const config = serverSchema.parse(input)
    await this.serialize(async () => {
      const previous = this.entries.get(config.id)
      await this.unmount(config.id)
      await this.mount(config, secret)
      try { await this.persist() }
      catch {
        await this.unmount(config.id)
        if (previous) await this.mount(previous.status.config)
        throw new OAuthMcpError('OAUTH_CONFIG_WRITE_FAILED')
      }
    })
    return null
  }
  @Remote
  async act(id: string, action: Action): Promise<null> {
    this.owner()
    await this.serialize(async () => {
      const entry = this.entries.get(id)
      if (!entry) throw new OAuthMcpError('OAUTH_SERVER_NOT_FOUND')
      if (action === 'cancel') { entry.attempt?.abort(); return }
      if (action === 'login') {
        if (entry.login) throw new OAuthMcpError('OAUTH_BUSY')
        if (!entry.status.config.enabled) throw new OAuthMcpError('OAUTH_DISABLED')
        await entry.connection.close()
        entry.connection = new Connection(this.ctx, entry.provider, entry.status)
        const controller = new AbortController(); entry.attempt = controller
        entry.status.authentication = 'authorizing'; entry.status.error = ''
        entry.login = this.ctx.authorization.begin({ key: this.key(id), signal: controller.signal, interaction: {
          notify: notice => { entry.status.authorizationUrl = notice.url ?? '' },
          prompt: async () => { throw new OAuthMcpError('OAUTH_INTERACTION_UNSUPPORTED') },
        } }).then(async outcome => {
          if (outcome.status === 'authorized' && !controller.signal.aborted) {
            entry.status.authentication = 'authorized'; await entry.connection.connect()
          }
        }).catch(error => {
          entry.status.error = controller.signal.aborted ? 'OAUTH_CANCELLED' : error instanceof OAuthMcpError ? error.code : 'OAUTH_FAILED'
        }).finally(() => {
          entry.status.authorizationUrl = ''; entry.attempt = undefined; entry.login = undefined
          if (entry.status.authentication === 'authorizing') entry.status.authentication = entry.provider.authorized ? 'authorized' : 'required'
        })
        return
      }
      const config = entry.status.config
      await this.unmount(id)
      if (action === 'clear' || action === 'remove') await this.ctx.credentials.deleteRecord(this.key(id))
      if (action !== 'remove') await this.mount(config)
      if (action === 'remove') {
        try { await this.persist() }
        catch { await this.mount(config); throw new OAuthMcpError('OAUTH_CONFIG_WRITE_FAILED') }
      }
    })
    return null
  }
  private async mount(config: ServerConfig, secret?: string): Promise<void> {
    if (this.closed) throw new OAuthMcpError('OAUTH_STOPPED')
    const key = this.key(config.id)
    const provider = new Provider(config, {
      read: async () => { const record = await this.ctx.credentials.readRecord(key); return record?.kind === 'grant' ? record.payload : undefined },
      write: async payload => { await this.ctx.credentials.modifyRecord(key, async () => ({ kind: 'grant', payload })) },
    }, this.receiveCallback)
    let failure = ''
    try { await provider.load(); if (secret !== undefined) await provider.setSecret(secret) }
    catch { failure = 'OAUTH_INVALID_GRANT_RECORD' }
    const status: ServerStatus = { config, authentication: provider.authorized ? 'authorized' : 'required', connection: config.enabled ? 'disconnected' : 'disabled', toolCount: 0, error: failure, authorizationUrl: '' }
    const disposeFlow = this.ctx.authorization.registerFlow({ key, label: config.label, methods: [{ id: 'oauth', label: 'OAuth' }],
      run: async session => provider.login(session.signal, url => session.notify({ message: 'Open the authorization page.', url })),
    })
    const connection = new Connection(this.ctx, provider, status)
    this.entries.set(config.id, { provider, connection, status, disposeFlow })
    if (config.enabled && provider.authorized && !failure) void connection.connect()
  }
  private async unmount(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry) return
    entry.attempt?.abort(); entry.disposeFlow()
    await entry.provider.stop(); await entry.login; await entry.connection.close()
    this.entries.delete(id)
  }
  private async persist(): Promise<void> {
    await mkdir(join(this.profile, 'mcp-oauth'), { recursive: true, mode: 0o700 })
    const temp = `${this.configFile}.${randomUUID()}.tmp`
    await writeFile(temp, JSON.stringify([...this.entries.values()].map(entry => entry.status.config), null, 2) + '\n', { mode: 0o600 })
    await rename(temp, this.configFile)
  }
  async stop(): Promise<void> {
    this.closed = true
    for (const entry of this.entries.values()) entry.attempt?.abort()
    await this.tail
    for (const id of [...this.entries.keys()]) await this.unmount(id)
  }
}
export async function apply(ctx: Context): Promise<void> {
  await mountPlugin(ctx, listenCallback)
}
/** Compose with a caller-owned callback listener, including reserved loopback sockets. */
export function withCallbackListener(receiveCallback: typeof listenCallback) {
  return { name, inject, apply: (ctx: Context) => mountPlugin(ctx, receiveCallback) }
}
async function mountPlugin(ctx: Context, receiveCallback: typeof listenCallback): Promise<void> {
  const service = new McpOAuth(ctx, receiveCallback)
  ctx.effect(() => () => service.stop(), 'mcp-oauth: connection and credential ownership')
  ctx.effect(() => ctx.typert.register({ package: 'dsh-mcp-oauth', face: 'host', schemas: [], model: { services: [], events: [], objects: [] }, invocations: remoteInfo.descriptors }), 'mcp-oauth: host invocation descriptors')
  await service.start()
}
