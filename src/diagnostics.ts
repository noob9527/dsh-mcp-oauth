/** Host-only diagnostics. Arbitrary error text and endpoint identities never leave this module. */
import { createHash } from 'node:crypto'

export type OAuthStage = 'callback_setup' | 'resource_challenge' | 'discovery_and_registration' | 'authorization_callback' | 'token_exchange' | 'credential_persistence' | 'refresh'
export type OAuthDiagnostic = {
  event: 'mcp_oauth_failure'; service: string; stage: OAuthStage
  causes: { type: string; code?: string; status?: number; reason?: 'proxy_tunnel_rejected' }[]
}
const names = new Set(['Error', 'TypeError', 'AggregateError', 'AbortError', 'TimeoutError', 'OAuthMcpError', 'OAuthError', 'SdkError', 'SdkHttpError', 'IssuerMismatchError', 'RegistrationRejectedError', 'InsecureTokenEndpointError', 'AuthorizationServerMismatchError', 'InsufficientScopeError', 'UnauthorizedError'])
const codes = new Set(['OAUTH_LOGIN_REQUIRED', 'OAUTH_CANCELLED', 'OAUTH_CALLBACK_UNAVAILABLE', 'OAUTH_CIMD_UNSUPPORTED', 'OAUTH_ISSUER_CHANGED', 'OAUTH_RESPONSE_INVALID', 'OAUTH_RESPONSE_INACTIVE', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'EACCES', 'EPERM', 'EADDRINUSE', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UND_ERR_ABORTED', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET', 'invalid_grant', 'invalid_client', 'access_denied', 'invalid_scope', 'unauthorized_client', 'unsupported_grant_type'])
/** Build bounded diagnostics from untrusted exceptions without copying messages, stacks or URLs.
 * @param identity Stable private service identity; only its digest is emitted.
 * @param stage OAuth operation that failed.
 * @param error Original exception; never serialized directly.
 * @returns A record containing only allowlisted classifications and HTTP status numbers.
 */
export function oauthDiagnostic(identity: string, stage: OAuthStage, error: unknown): OAuthDiagnostic {
  const causes: OAuthDiagnostic['causes'] = []
  const seen = new Set<object>()
  const visit = (value: unknown): void => {
    if (causes.length >= 6 || !value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    const row: OAuthDiagnostic['causes'][number] = { type: 'UnknownError' }
    if ('name' in value && typeof value.name === 'string' && names.has(value.name)) row.type = value.name
    if ('code' in value && typeof value.code === 'string' && codes.has(value.code)) row.code = value.code
    if ('status' in value && Number.isInteger(value.status) && typeof value.status === 'number' && value.status >= 400 && value.status <= 599) row.status = value.status
    // Some proxy clients expose tunnel status only as text; extract the number, never the text.
    if ('message' in value && typeof value.message === 'string') {
      const match = /Proxy response \(([45]\d{2})\) !== 200 when HTTP Tunneling/.exec(value.message)
      if (match) { row.status = Number(match[1]); row.reason = 'proxy_tunnel_rejected' }
    }
    causes.push(row)
    if ('cause' in value) visit(value.cause)
    if (value instanceof AggregateError) for (const child of value.errors.slice(0, 6)) visit(child)
  }
  visit(error)
  return { event: 'mcp_oauth_failure', service: createHash('sha256').update(identity).digest('hex').slice(0, 16), stage, causes }
}
/** Emit only the sanitized record to the Host's stderr, never to remote UI or session events. */
export function logOAuthFailure(identity: string, stage: OAuthStage, error: unknown): void {
  console.warn(JSON.stringify(oauthDiagnostic(identity, stage, error)))
}
