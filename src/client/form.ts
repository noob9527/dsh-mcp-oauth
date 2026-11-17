/** Registration-dependent callback visibility for the settings form. */
import type { ServerConfig } from '../config.ts'

export const defaultMetadataUrl = 'https://noob9527.github.io/dsh-mcp-oauth/oauth/client-metadata.json'
/** Whether the hosted document is selected by the current registration settings. */
export function usesDefaultMetadata(config: ServerConfig): boolean {
  return config.metadataUrl === defaultMetadataUrl &&
    (config.mode === 'cimd' || config.mode === 'auto' && !config.clientId)
}
/** Whether the callback address can be edited for the selected mode. */
export function showsCallbackUrl(config: ServerConfig): boolean {
  return config.callbackMode !== 'local' && !usesDefaultMetadata(config)
}
/** Switching to local restores a loopback address without rewriting an existing local address. */
export function changeCallbackMode(config: ServerConfig, callbackMode: ServerConfig['callbackMode']): ServerConfig {
  const redirect = URL.canParse(config.redirectUrl) ? new URL(config.redirectUrl) : undefined
  const local = redirect?.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(redirect.hostname)
  return { ...config, callbackMode, redirectUrl: callbackMode === 'local' && !local ? 'http://127.0.0.1/oauth/callback' : config.redirectUrl }
}
