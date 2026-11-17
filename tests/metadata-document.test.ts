import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { serverSchema } from '../src/config.ts'

test('invalid metadata addresses produce validation failures without throwing', () => {
  for (const metadataUrl of ['invalid', 'http://example.com/client.json', 'https://example.com/#fragment']) {
    assert.equal(serverSchema.safeParse({ id: 'example', label: 'Example', url: 'https://mcp.example.com/mcp', metadataUrl }).success, false)
  }
})

test('published public-client metadata matches the default local callback', () => {
  const metadata = JSON.parse(readFileSync(new URL('../site/oauth/client-metadata.json', import.meta.url), 'utf8'))
  const config = serverSchema.parse({ id: 'example', label: 'Example', url: 'https://mcp.example.com/mcp', metadataUrl: metadata.client_id })
  assert.equal(metadata.client_id, 'https://noob9527.github.io/dsh-mcp-oauth/oauth/client-metadata.json')
  assert.deepEqual(metadata.redirect_uris, [config.redirectUrl, 'http://localhost/oauth/callback'])
  assert.equal(metadata.application_type, 'native')
  assert.equal(metadata.token_endpoint_auth_method, 'none')
  assert.equal('client_secret' in metadata, false)
})
