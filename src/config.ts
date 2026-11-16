/** Public configuration and wire-safe status schemas. */
import { z } from 'zod'

const endpoint = z.string().url().refine(value => {
  const url = new URL(value)
  return !url.username && !url.password && !url.hash && (url.protocol === 'https:' ||
    url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname))
}, 'Use HTTPS, or HTTP on loopback, without user information or fragments.')
const duration = z.number().int().min(100).max(3_600_000)
export const serverSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  label: z.string().min(1).max(100),
  url: endpoint,
  enabled: z.boolean().default(true),
  mode: z.enum(['auto', 'cimd', 'preregistered', 'dcr']).default('auto'),
  clientId: z.string().max(2048).default(''),
  metadataUrl: z.union([z.literal(''), z.string().url().refine(value => {
    const url = new URL(value)
    return url.protocol === 'https:' && url.pathname !== '/' && !url.username && !url.password && !url.hash
  })]).default(''),
  redirectUrl: z.string().url().default('http://127.0.0.1:6274/oauth/callback').refine(value => {
    const url = new URL(value)
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && !!url.port &&
      Number(url.port) > 0 && url.pathname !== '/' && !url.search && !url.hash && !url.username && !url.password
  }, 'Use an explicit loopback port and callback path.'),
  scope: z.string().max(2048).default(''),
  connectTimeoutMs: duration.default(30_000),
  authTimeoutMs: duration.default(300_000),
  toolTimeoutMs: duration.default(600_000),
  refreshSkewMs: z.number().int().min(0).max(300_000).default(60_000),
  reconnectAttempts: z.number().int().min(0).max(20).default(5),
  reconnectMaxDelayMs: duration.default(30_000),
}).strict().superRefine((value, ctx) => {
  if (value.mode === 'cimd' && !value.metadataUrl) ctx.addIssue({ code: 'custom', path: ['metadataUrl'], message: 'CIMD requires a metadata document URL.' })
  if (value.mode === 'preregistered' && !value.clientId) ctx.addIssue({ code: 'custom', path: ['clientId'], message: 'Pre-registration requires a client ID.' })
})
export type ServerConfig = z.infer<typeof serverSchema>
export const statusSchema = z.object({
  config: serverSchema,
  authentication: z.enum(['required', 'authorizing', 'authorized']),
  connection: z.enum(['disabled', 'disconnected', 'connecting', 'connected', 'failed']),
  toolCount: z.number().int(),
  error: z.string(),
  authorizationUrl: z.string(),
})
export type ServerStatus = z.infer<typeof statusSchema>
export const actionSchema = z.enum(['login', 'cancel', 'reconnect', 'clear', 'remove'])
export type Action = z.infer<typeof actionSchema>
