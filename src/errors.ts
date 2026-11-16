/** Expected failures are safe to expose without upstream response bodies. */
import { HarnessError } from '@deepseek-ai/dsh-error'
export class OAuthMcpError extends HarnessError {
  constructor(code: string) { super(code, code) }
}
export function cancelled(): Error { return new DOMException('Cancelled', 'AbortError') }
