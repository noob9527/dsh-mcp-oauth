import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serviceIdFromLabel } from '../src/client/service-id.ts'
import { serverSchema } from '../src/config.ts'

test('display names generate valid deterministic IDs without resolving collisions', () => {
  assert.equal(serviceIdFromLabel('Research MCP'), 'research-mcp')
  assert.equal(serviceIdFromLabel('Café'), 'cafe')
  assert.equal(serviceIdFromLabel('123 Search'), 'service-123-search')
  assert.equal(serviceIdFromLabel('知识库'), 'u77e5-u8bc6-u5e93')
  assert.equal(serviceIdFromLabel('Research MCP'), serviceIdFromLabel('Research--MCP'))
  for (const value of ['', '!!!', '知识库', '123', 'a'.repeat(100), '🧪 Search', '中文'.repeat(30)]) {
    const id = serviceIdFromLabel(value)
    assert(serverSchema.shape.id.safeParse(id).success)
    assert.equal(id, serviceIdFromLabel(value))
  }
})
