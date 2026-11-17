import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serverSchema } from '../src/config.ts'
import { defaultMetadataUrl, usesDefaultMetadata, showsCallbackUrl, changeCallbackMode } from '../src/client/form.ts'
const base = serverSchema.parse({ id: 'test', label: 'Test', url: 'https://mcp.example.com/mcp', metadataUrl: defaultMetadataUrl })

test('inactive default metadata cannot hide remote or manual callback configuration', () => {
  for (const mode of ['dcr', 'preregistered', 'auto'] as const) {
    for (const callbackMode of ['remote', 'manual'] as const) {
      const draft = { ...base, mode, clientId: 'registered', callbackMode }
      assert.equal(usesDefaultMetadata(draft), false)
      assert.equal(showsCallbackUrl(draft), true)
      assert(serverSchema.safeParse({ ...draft, redirectUrl: 'https://example.com/oauth/callback' }).success)
    }
  }
})
test('active default document hides callbacks; custom documents allow nonlocal configuration', () => {
  for (const mode of ['auto', 'cimd'] as const) {
    const draft = { ...base, mode, callbackMode: 'remote' as const }
    assert.equal(usesDefaultMetadata(draft), true)
    assert.equal(showsCallbackUrl(draft), false)
    assert.equal(showsCallbackUrl({ ...draft, metadataUrl: 'https://example.com/client.json' }), true)
  }
  assert.equal(showsCallbackUrl(base), false)
})
test('switching remote to local produces a valid hidden callback without changing the original config', () => {
  const remote = { ...base, callbackMode: 'remote' as const, redirectUrl: 'https://example.com/oauth/callback' }
  const local = changeCallbackMode(remote, 'local')
  assert(serverSchema.safeParse(local).success)
  assert.equal(local.redirectUrl, 'http://127.0.0.1/oauth/callback')
  assert.equal(remote.redirectUrl, 'https://example.com/oauth/callback')
  const fixed = { ...base, redirectUrl: 'http://localhost:6274/custom' }
  assert.equal(changeCallbackMode(fixed, 'local').redirectUrl, fixed.redirectUrl)
})
