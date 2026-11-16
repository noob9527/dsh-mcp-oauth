/** Expected failures are safe to expose without upstream response bodies. */
import { HarnessError } from '@deepseek-ai/dsh-llm'
export class OAuthMcpError extends HarnessError {
  constructor(code: string) {
    super(code === 'MCP_CALL_OUTCOME_UNKNOWN'
      ? 'MCP tool result is unknown (结果未知). The request may have executed; do not automatically retry. Check the server before retrying.'
      : code === 'OAUTH_LOGIN_REQUIRED'
        ? 'MCP authorization requires sign-in (需要重新登录). Open Plugins → OAuth MCP and sign in to this service.'
        : code, code)
  }
}
export function cancelled(): Error { return new DOMException('Cancelled', 'AbortError') }
