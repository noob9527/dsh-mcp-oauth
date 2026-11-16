/** Connection ownership, tool admission and bounded reconnection. */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { Client, StreamableHTTPClientTransport, UnauthorizedError, SdkHttpError, SdkErrorCode } from '@modelcontextprotocol/client'
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client'
import type { Provider } from './provider.ts'
import type { ServerStatus } from './config.ts'
import { OAuthMcpError } from './errors.ts'

export function toolName(server: string, raw: string): string {
  const name = `mcp__${server}__${raw}`
  if (name.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(name)) return name
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 51) + '_' + createHash('sha256').update(JSON.stringify([server, raw])).digest('hex').slice(0, 12)
}
export class Connection {
  private client?: Client
  private abort?: AbortController
  private registrations: (() => void)[] = []
  private pending?: Promise<void>
  private timer?: ReturnType<typeof setTimeout>
  private disposed = false
  private attempts = 0
  private calls = new Set<Promise<unknown>>()
  private retiring = new Set<Promise<void>>()
  private sync: Promise<void> = Promise.resolve()
  constructor(private readonly ctx: Context, private readonly provider: Provider, private readonly status: ServerStatus) {}
  connect(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    if (this.pending) return this.pending
    if (this.status.connection === 'connected') return Promise.resolve()
    this.pending = this.open().finally(() => { this.pending = undefined })
    return this.pending
  }
  private async open(): Promise<void> {
    const config = this.provider.config
    clearTimeout(this.timer); this.timer = undefined
    this.status.connection = 'connecting'; this.status.error = ''
    const client = new Client({ name: '@noob9527/dsh-mcp-oauth', version: '0.1.0' })
    const abort = new AbortController()
    this.client = client; this.abort = abort
    const transport = new StreamableHTTPClientTransport(new URL(config.url), { authProvider: this.provider.transportAuth })
    const lost = () => {
      if (this.disposed || client !== this.client) return
      void this.retire(client, 'MCP_DISCONNECTED', true)
    }
    client.onclose = lost
    client.onerror = () => { /* Individual request failures are reported by their caller. */ }
    client.setNotificationHandler('notifications/tools/list_changed', async () => {
      try { await this.synchronize(client) } catch { await this.retire(client, 'MCP_TOOL_LIST_FAILED', true) }
    })
    try {
      await client.connect(transport, { timeout: config.connectTimeoutMs, signal: abort.signal })
      await this.synchronize(client)
      if (this.disposed || client !== this.client) return
      this.status.connection = 'connected'; this.status.error = ''; this.attempts = 0
    } catch (error) {
      client.onclose = undefined
      await client.close().catch(() => {})
      if (this.disposed || client !== this.client) return
      this.status.connection = 'failed'
      this.status.error = isAuthenticationError(error) ? 'OAUTH_LOGIN_REQUIRED' : error instanceof OAuthMcpError ? error.code : 'MCP_CONNECT_FAILED'
      if (this.status.error === 'OAUTH_LOGIN_REQUIRED') this.status.authentication = 'required'
      else this.schedule()
    }
  }
  private synchronize(client: Client): Promise<void> {
    const task = this.sync.then(async () => {
      const tools = []
      let cursor: string | undefined
      const seen = new Set<string>()
      do {
        const page = await client.listTools(cursor ? { cursor } : undefined, { cacheMode: 'refresh', timeout: this.provider.config.connectTimeoutMs, signal: this.abort?.signal })
        tools.push(...page.tools)
        cursor = page.nextCursor
        if (cursor && seen.has(cursor)) throw new OAuthMcpError('MCP_INVALID_TOOL_LIST')
        if (cursor) seen.add(cursor)
      } while (cursor)
      if (this.disposed || client !== this.client) return
      const names = new Set<string>()
      const definitions = tools.map(tool => {
        const name = toolName(this.provider.config.id, tool.name)
        if (names.has(name)) throw new OAuthMcpError('MCP_TOOL_NAME_CONFLICT')
        names.add(name)
        if (tool.execution?.taskSupport === 'required') throw new OAuthMcpError('MCP_TASKS_UNSUPPORTED')
        return createMcpToolDefinition(this.ctx, {
          name, rawName: tool.name, description: tool.description ?? tool.name,
          inputSchema: tool.inputSchema, outputSchema: tool.outputSchema,
          call: (args, execution) => {
            const operation = (async () => {
            if (this.disposed || client !== this.client) throw new OAuthMcpError('MCP_DISCONNECTED')
            try {
              return await client.callTool({ name: tool.name, arguments: args }, {
                signal: AbortSignal.any([execution.signal, this.abort!.signal]),
                timeout: this.provider.config.toolTimeoutMs,
                maxTotalTimeout: this.provider.config.toolTimeoutMs,
                resetTimeoutOnProgress: false,
              })
            } catch (error) {
              if (execution.signal.aborted) throw execution.signal.reason
              if (isAuthenticationError(error)) {
                await this.retire(client, 'OAUTH_LOGIN_REQUIRED', false)
                throw new OAuthMcpError('OAUTH_LOGIN_REQUIRED')
              }
              if (error instanceof OAuthMcpError) {
                if (error.code === 'OAUTH_LOGIN_REQUIRED') await this.retire(client, error.code, false)
                throw error
              }
              await this.retire(client, 'MCP_CALL_OUTCOME_UNKNOWN', true)
              throw new OAuthMcpError('MCP_CALL_OUTCOME_UNKNOWN')
            }
            })()
            this.calls.add(operation)
            void operation.finally(() => this.calls.delete(operation)).catch(() => {})
            return operation
          },
        })
      })
      this.unregister()
      try { for (const definition of definitions) this.registrations.push(this.ctx.tools.register(definition)) }
      catch { this.unregister(); throw new OAuthMcpError('MCP_TOOL_REGISTRATION_FAILED') }
      this.status.toolCount = definitions.length
    })
    this.sync = task.catch(() => { this.status.error = 'MCP_TOOL_LIST_FAILED' })
    return task
  }
  private async retire(client: Client, code: string, retry: boolean): Promise<void> {
    if (this.disposed || client !== this.client) return
    this.client = undefined; client.onclose = undefined
    this.unregister(); this.abort?.abort()
    this.status.connection = 'failed'; this.status.error = code
    if (!retry) this.status.authentication = 'required'
    const task = client.close().catch(() => { /* The failed generation has already been withdrawn. */ })
    this.retiring.add(task)
    try { await task } finally { this.retiring.delete(task) }
    if (retry) this.schedule()
  }
  private schedule(): void {
    if (this.disposed || this.timer || this.attempts >= this.provider.config.reconnectAttempts) return
    const delay = Math.min(1000 * 2 ** this.attempts++, this.provider.config.reconnectMaxDelayMs)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.connect()
    }, delay)
  }
  private unregister(): void { for (const dispose of this.registrations.splice(0)) dispose(); this.status.toolCount = 0 }
  async close(): Promise<void> {
    this.disposed = true; clearTimeout(this.timer); this.unregister(); this.abort?.abort()
    if (this.client) { this.client.onclose = undefined; await this.client.close().catch(() => {}) }
    await this.pending; await this.sync
    await Promise.allSettled([...this.calls, ...this.retiring])
    this.status.connection = this.provider.config.enabled ? 'disconnected' : 'disabled'
  }
}

/** SDK transport represents an exhausted 401 retry as an HTTP authentication error. */
function isAuthenticationError(error: unknown): boolean {
  return error instanceof UnauthorizedError || error instanceof SdkHttpError && error.code === SdkErrorCode.ClientHttpAuthentication
}
