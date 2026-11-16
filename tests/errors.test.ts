/** Domain errors retain the Host error identity across supported releases. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { OAuthMcpError } from '../src/errors.ts'

test('OAuth failures preserve the Host HarnessError class and stable machine code', () => {
  for (const code of ['OAUTH_LOGIN_REQUIRED', 'MCP_CALL_OUTCOME_UNKNOWN', 'OAUTH_OWNER_REQUIRED']) {
    const error = new OAuthMcpError(code)
    assert(error instanceof HarnessError)
    assert.equal(error.name, 'OAuthMcpError')
    assert.equal(error.code, code)
    assert(error.message.length > 0)
  }
})
