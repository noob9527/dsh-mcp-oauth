import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serverSchema } from '../src/config.ts'
import { toolName } from '../src/connection.ts'
import { remoteInfo } from '../src/remote.ts'

test('remote HTTP and non-loopback callbacks are rejected', () => {
  const config = { id: 'test', label: 'Test', url: 'https://mcp.example.com/mcp' }
  assert(!serverSchema.safeParse({ ...config, url: 'http://mcp.example.com/mcp' }).success)
  assert(!serverSchema.safeParse({ ...config, redirectUrl: 'http://0.0.0.0:6274/callback' }).success)
  assert(!serverSchema.safeParse({ ...config, mode: 'cimd' }).success)
  assert(!serverSchema.safeParse({ ...config, mode: 'preregistered' }).success)
  assert(!serverSchema.safeParse({ ...config, client_secret: 'not-a-config-field' }).success)
})
test('lossy tool names are distinct and respect model name limits', () => {
  assert.notEqual(toolName('test', 'a.b'), toolName('test', 'a/b'))
  assert(toolName('test', 'x'.repeat(200)).length <= 64)
  assert.notEqual(toolName('first', 'search'), toolName('second', 'search'))
})
test('strict Remote outputs strip secret fields', () => {
  const descriptor = remoteInfo.descriptors.find(value => value.method === 'list')!
  assert.equal(descriptor.result.mode, 'strict')
  if (descriptor.result.mode !== 'strict') return
  const output = descriptor.result.create().parse([{ config: serverSchema.parse({ id: 'test', label: 'Test', url: 'https://mcp.example.com/mcp' }), authentication: 'required', connection: 'disconnected', toolCount: 0, error: '', authorizationUrl: '', access_token: 'never-output' }])
  assert(!JSON.stringify(output).includes('never-output'))
})
