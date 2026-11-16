/** Settings surface mounted through the official plugin-page slot. */
import { useEffect, useState, type CSSProperties } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { z } from 'zod'
import { remoteInfo } from '../remote.ts'
import { serverSchema, statusSchema, type ServerConfig, type ServerStatus, type Action } from '../config.ts'
import { en, zh, type Key } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'mcp.oauth': Key } }
type Invoke = (method: 'list' | 'save' | 'act', input: object, signal?: AbortSignal) => Promise<unknown>
type Props = PropsRuntime<'plugins.item'> & PropsLocale<'mcp.oauth'> & { invoke: Invoke }
const stack: CSSProperties = { display: 'grid', gap: 12, minWidth: 0 }
const actions: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }
const box: CSSProperties = { ...stack, padding: 16, border: '1px solid var(--dsw-border)', borderRadius: 12, overflowWrap: 'anywhere' }
const numeric = ['connectTimeoutMs', 'authTimeoutMs', 'toolTimeoutMs', 'refreshSkewMs', 'reconnectAttempts', 'reconnectMaxDelayMs'] as const
function Card({ t, view, invoke }: Props) {
  const [rows, setRows] = useState<ServerStatus[]>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<ServerConfig>()
  const [editing, setEditing] = useState(false)
  const [secret, setSecret] = useState('')
  useEffect(() => {
    if (view === 'summary') return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const value = await invoke('list', {}, controller.signal)
        if (!controller.signal.aborted) setRows(z.array(statusSchema).parse(value))
      } catch (error) { if (!controller.signal.aborted) setError(t('failed') + ' ' + (error instanceof Error ? error.message : 'UNKNOWN')) }
      if (!controller.signal.aborted) timer = setTimeout(() => { void poll() }, 1500)
    }
    void poll()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [invoke, view, t])
  if (view === 'summary') return t('description')
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError('')
    try { await operation(); setRows(z.array(statusSchema).parse(await invoke('list', {}))) }
    catch { setError(t('failed')) }
    finally { setBusy(false) }
  }
  const act = (id: string, action: Action) => {
    if (action === 'remove' && !window.confirm(t('deleteConfirm'))) return
    if (action === 'clear' && !window.confirm(t('clearConfirm'))) return
    void run(() => invoke('act', { id, action }))
  }
  return <section style={stack}>
    <p>{t('local')}</p>
    {error && <p role="alert">{error}</p>}
    {!rows ? <p>{t('loading')}</p> : !rows.length ? <p>{t('empty')}</p> : rows.map(row => <section key={row.config.id} style={box}>
      <strong>{row.config.label}</strong><span>{row.config.url}</span>
      <span role="status">{t(row.authentication)} · {t(row.connection === 'failed' ? 'connectionFailed' : row.connection)} · {t('tools')}: {row.toolCount}</span>
      {row.error && <p role="alert">{t('failed')} ({row.error})</p>}
      {row.authorizationUrl && <a href={row.authorizationUrl} target="_blank" rel="noopener noreferrer">{t('open')}</a>}
      <div style={actions}>
        <Button disabled={busy || !row.config.enabled} onClick={() => act(row.config.id, row.authentication === 'authorizing' ? 'cancel' : 'login')}>{t(row.authentication === 'authorizing' ? 'cancel' : 'login')}</Button>
        <Button disabled={busy || row.authentication !== 'authorized' || !row.config.enabled} onClick={() => act(row.config.id, 'reconnect')}>{t('reconnect')}</Button>
        <Button disabled={busy} onClick={() => { setDraft(row.config); setEditing(true); setSecret('') }}>{t('edit')}</Button>
        <Button disabled={busy} onClick={() => { void run(() => invoke('save', { config: { ...row.config, enabled: !row.config.enabled } })) }}>{t(row.config.enabled ? 'disable' : 'enable')}</Button>
        <Button disabled={busy} onClick={() => act(row.config.id, 'clear')}>{t('clear')}</Button>
        <Button disabled={busy} onClick={() => act(row.config.id, 'remove')}>{t('remove')}</Button>
      </div>
    </section>)}
    {!draft && <Button disabled={busy} onClick={() => { setDraft(serverSchema.parse({ id: 'service', label: 'MCP', url: 'https://mcp.example.com/mcp' })); setEditing(false); setSecret('') }}>{t('add')}</Button>}
    {draft && <form style={box} onSubmit={event => {
      event.preventDefault()
      const parsed = serverSchema.safeParse(draft)
      if (!parsed.success || !editing && rows?.some(row => row.config.id === draft.id)) { setError(t('invalid')); return }
      void run(async () => { await invoke('save', { config: parsed.data, ...(secret ? { secret } : {}) }); setDraft(undefined); setSecret('') })
    }}>
      {(['id', 'label', 'url', 'clientId', 'metadataUrl', 'redirectUrl', 'scope'] as const).map(key => <label key={key} style={stack}>{t(key)}
        <Input value={draft[key]} disabled={busy || key === 'id' && editing} onChange={event => setDraft({ ...draft, [key]: event.target.value })} />
      </label>)}
      <label style={stack}>{t('mode')}<select disabled={busy} value={draft.mode} onChange={event => setDraft({ ...draft, mode: serverSchema.shape.mode.parse(event.target.value) })}>
        {(['auto', 'cimd', 'preregistered', 'dcr'] as const).map(mode => <option key={mode} value={mode}>{t(mode)}</option>)}
      </select></label>
      <label style={stack}>{t('secret')}<Input type="password" autoComplete="new-password" value={secret} disabled={busy} onChange={event => setSecret(event.target.value)} /></label>
      <details><summary>{t('advanced')}</summary><div style={stack}>{numeric.map(key => <label style={stack} key={key}>{t(key)}<Input type="number" value={draft[key]} onChange={event => setDraft({ ...draft, [key]: Number(event.target.value) })} /></label>)}</div></details>
      <div style={actions}><Button type="submit" disabled={busy}>{t('save')}</Button><Button type="button" disabled={busy} onClick={() => { setDraft(undefined); setSecret('') }}>{t('discard')}</Button></div>
    </form>}
  </section>
}
export const inject = ['slots', 'locale', 'remote']
export async function apply(ctx: Context): Promise<void> {
  const dispose = await ctx.remote.$mount(remoteInfo)
  ctx.effect(() => dispose, 'mcp-oauth: client remote mount')
  ctx.effect(() => ctx.locale.register('mcp.oauth', { en, zh }), 'mcp-oauth: dictionaries')
  ctx.inject(['remote.mcpOAuth', 'slots', 'locale'], consumer => {
  const t = consumer.locale.bind('mcp.oauth')
  const invoke: Invoke = async (name, input, signal) => {
    const method = remoteInfo.methods[`mcpOAuth/${name}`]!
    const result = await method.invoke(consumer.remote, input, signal)
    if ('ok' in result && result.ok) return result.value
    throw new Error('ok' in result && !result.ok ? result.error.code : 'MCP_OAUTH_REMOTE_FAILED')
  }
  consumer.effect(() => consumer.slots.inject('plugins.item', () => consumer.slots.register({ name: 'plugins.item', id: 'mcp-oauth', order: 50, label: () => t('title'), locale: 'mcp.oauth', inject: () => ({ invoke }) }, Card)), 'mcp-oauth: settings page')
  })
}
