/** Strict, shared Remote descriptors; no secrets in response schemas. */
import { z } from 'zod'
import { createTypertRemoteInfo, type TypertRemoteCodecSpec, type TypertRemoteMethodSpec } from '@deepseek-ai/dsh-typert-protocol'
import { serverSchema, statusSchema, actionSchema } from './config.ts'

function codec(schema: z.ZodType): TypertRemoteCodecSpec {
  return { mode: 'strict', typeSymbol: '@noob9527/dsh-mcp-oauth#value', create: () => schema }
}
function method(parameters: [string, z.ZodType][], result: z.ZodType): TypertRemoteMethodSpec {
  return { service: 'mcpOAuth', invocation: { kind: 'direct' }, parameters: parameters.map(([name, schema]) => ({ name, source: 'json', ...(schema.safeParse(undefined).success ? { acceptsUndefined: true as const } : {}), codec: codec(schema), strictCodec: codec(schema) })), result: codec(result) }
}
export const remoteInfo = createTypertRemoteInfo({ package: '@noob9527/dsh-mcp-oauth', methods: {
  'mcpOAuth/list': method([], z.array(statusSchema)),
  'mcpOAuth/save': method([['config', serverSchema], ['secret', z.string().max(8192).optional()]], z.null()),
  'mcpOAuth/submitResponse': method([['id', z.string().max(32)], ['response', z.string().min(1).max(16384)]], z.null()),
  'mcpOAuth/act': method([['id', z.string()], ['action', actionSchema]], z.null()),
} }, z)
