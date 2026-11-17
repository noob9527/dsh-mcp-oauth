import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serverSchema } from '../src/config.ts'
import { defaultMetadataUrl, usesDefaultMetadata, showsCallbackUrl, changeCallbackMode, parseServiceForm } from '../src/client/form.ts'
const base = serverSchema.parse({ id: 'test', label: 'Test', url: 'https://mcp.example.com/mcp', metadataUrl: defaultMetadataUrl })

test('saving DCR and pre-registration excludes unused metadata without losing the draft', () => {
  for (const mode of ['dcr', 'preregistered'] as const) {
    const draft = { ...base, mode, clientId: 'registered', metadataUrl: 'not-a-url' }
    const result = parseServiceForm(draft)
    assert(result.success)
    assert.equal(result.data.metadataUrl, '')
    assert.equal(result.data.clientId, 'registered')
    assert.equal(draft.metadataUrl, 'not-a-url')
    assert.equal(parseServiceForm({ ...draft, mode: 'auto' }).success, false)
  }
})
test('saving active metadata and other fields still validates their values', () => {
  for (const mode of ['auto', 'cimd'] as const) {
    assert.equal(parseServiceForm({ ...base, mode, metadataUrl: 'not-a-url' }).success, false)
    const result = parseServiceForm({ ...base, mode })
    assert(result.success)
    assert.equal(result.data.metadataUrl, defaultMetadataUrl)
  }
  assert.equal(parseServiceForm({ ...base, mode: 'preregistered', clientId: '' }).success, false)
  assert.equal(parseServiceForm({ ...base, mode: 'dcr', url: 'not-a-url' }).success, false)
  assert.equal(parseServiceForm({ ...base, mode: 'dcr', connectTimeoutMs: -1 }).success, false)
})

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
