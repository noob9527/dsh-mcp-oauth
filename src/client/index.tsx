/** Settings surface mounted through the official plugin-page slot. */
import { useEffect, useState, type CSSProperties } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import { z } from 'zod'
import { remoteInfo } from '../remote.ts'
import { serverSchema, statusSchema, type ServerConfig, type ServerStatus, type Action } from '../config.ts'
import { serviceIdFromLabel } from './service-id.ts'
import { en, zh, type Key } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' { interface LocaleNamespaceMap { 'mcp.oauth': Key } }
type Invoke = (method: 'list' | 'save' | 'act' | 'submitResponse', input: object, signal?: AbortSignal) => Promise<unknown>
type Props = PropsRuntime<'plugins.item'> & PropsLocale<'mcp.oauth'> & { invoke: Invoke }
const stack: CSSProperties = { display: 'grid', gap: 12, minWidth: 0 }
const actions: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8 }
const box: CSSProperties = { ...stack, padding: 16, border: '1px solid var(--dsw-border)', borderRadius: 12, overflowWrap: 'anywhere' }
const numeric = ['connectTimeoutMs', 'authTimeoutMs', 'toolTimeoutMs', 'refreshSkewMs', 'reconnectAttempts', 'reconnectMaxDelayMs'] as const
/** Input lives only for one pending attempt and is cleared before submission. */
function ManualInput({ id, t, invoke }: { id: string; t: Props['t']; invoke: Invoke }) {
  const [response, setResponse] = useState('')
  const [pending, setPending] = useState(false)
  const [received, setReceived] = useState(false)
  const [error, setError] = useState('')
  return <form style={stack} onSubmit={async event => {
    event.preventDefault()
    if (pending || received) return
    const value = response; setResponse(''); setPending(true); setError('')
    try { await invoke('submitResponse', { id, response: value }); setReceived(true) }
    catch { setError(t('manualInvalid')) }
    finally { setPending(false) }
  }}>
    <p>{t('manualInstructions')}</p>
    <label style={stack}>{t('manualResponse')}<Input type="password" autoComplete="off" spellCheck={false} maxLength={16384} value={response} disabled={pending || received} onChange={event => setResponse(event.target.value)} /></label>
    <Button type="submit" disabled={pending || received || !response.trim()}>{t('manualSubmit')}</Button>
    {error && <p role="alert">{error}</p>}
    {received && <p role="status">{t('manualReceived')}</p>}
  </form>
}
function Card({ t, view, invoke }: Props) {
  const [rows, setRows] = useState<ServerStatus[]>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState<ServerConfig>()
  const [editing, setEditing] = useState(false)
  const [customId, setCustomId] = useState(false)
  const [advanced, setAdvanced] = useState(false)
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
    <p>{t('deploymentHelp')}</p>
    {error && <p role="alert">{error}</p>}
    {!rows ? <p>{t('loading')}</p> : !rows.length ? <p>{t('empty')}</p> : rows.map(row => <section key={row.config.id} style={box}>
      <strong>{row.config.label}</strong><span>{row.config.url}</span>
      <span role="status">{t(row.authentication)} · {t(row.connection === 'failed' ? 'connectionFailed' : row.connection)} · {t('tools')}: {row.toolCount}</span>
      {row.error && <p role="alert">{t('failed')} ({row.error})</p>}
      {row.authorizationUrl && <a href={row.authorizationUrl} target="_blank" rel="noopener noreferrer">{t('open')}</a>}
      {row.config.callbackMode === 'manual' && row.authentication === 'authorizing' && row.authorizationUrl && <ManualInput key={row.authorizationUrl} id={row.config.id} t={t} invoke={invoke} />}
      <div style={actions}>
        <Button disabled={busy || !row.config.enabled} onClick={() => act(row.config.id, row.authentication === 'authorizing' ? 'cancel' : 'login')}>{t(row.authentication === 'authorizing' ? 'cancel' : 'login')}</Button>
        <Button disabled={busy || row.authentication !== 'authorized' || !row.config.enabled} onClick={() => act(row.config.id, 'reconnect')}>{t('reconnect')}</Button>
        <Button disabled={busy} onClick={() => { setDraft(row.config); setEditing(true); setCustomId(false); setAdvanced(false); setSecret('') }}>{t('edit')}</Button>
        <Button disabled={busy} onClick={() => { void run(() => invoke('save', { config: { ...row.config, enabled: !row.config.enabled } })) }}>{t(row.config.enabled ? 'disable' : 'enable')}</Button>
        <Button disabled={busy} onClick={() => act(row.config.id, 'clear')}>{t('clear')}</Button>
        <Button disabled={busy} onClick={() => act(row.config.id, 'remove')}>{t('remove')}</Button>
      </div>
    </section>)}
    {!draft && <Button disabled={busy} onClick={() => { setDraft(serverSchema.parse({ id: serviceIdFromLabel('MCP'), label: 'MCP', url: 'https://mcp.example.com/mcp', metadataUrl: 'https://noob9527.github.io/dsh-mcp-oauth/oauth/client-metadata.json' })); setEditing(false); setCustomId(false); setAdvanced(false); setSecret('') }}>{t('add')}</Button>}
    {draft && <form style={box} onSubmit={event => {
      event.preventDefault()
      const parsed = serverSchema.safeParse(draft)
      if (!editing && rows?.some(row => row.config.id === draft.id)) { setAdvanced(true); setError(t('duplicateId')); return }
      if (!parsed.success) { if (!serverSchema.shape.id.safeParse(draft.id).success || !serverSchema.shape.metadataUrl.safeParse(draft.metadataUrl).success || (draft.mode === 'cimd' && !draft.metadataUrl)) setAdvanced(true); setError(t('invalid')); return }
      void run(async () => { await invoke('save', { config: parsed.data, ...(secret ? { secret } : {}) }); setDraft(undefined); setSecret('') })
    }}>
      <label style={stack}>{t('callbackMode')}<select disabled={busy} value={draft.callbackMode} onChange={event => setDraft({ ...draft, callbackMode: serverSchema.shape.callbackMode.parse(event.target.value) })}>
        <option value="local">{t('localMode')}</option><option value="remote">{t('remoteMode')}</option><option value="manual">{t('manualMode')}</option>
      </select></label>
      <p>{t(draft.callbackMode === 'manual' ? 'manualHelp' : draft.callbackMode === 'remote' ? 'remoteHelp' : 'local')}</p>
      {draft.callbackMode === 'remote' && <label style={stack}>{t('callbackPort')}<Input type="number" disabled={busy} value={draft.callbackPort} onChange={event => setDraft({ ...draft, callbackPort: Number(event.target.value) })} /></label>}
      {(['label', 'url', 'clientId', 'redirectUrl', 'scope'] as const).map(key => <label key={key} style={stack}>{t(key)}
        <Input value={draft[key]} disabled={busy} onChange={event => setDraft({ ...draft, [key]: event.target.value, ...(key === 'label' && !editing && !customId ? { id: serviceIdFromLabel(event.target.value) } : {}) })} />
      </label>)}
      <label style={stack}>{t('mode')}<select disabled={busy} value={draft.mode} onChange={event => setDraft({ ...draft, mode: serverSchema.shape.mode.parse(event.target.value) })}>
        {(['auto', 'cimd', 'preregistered', 'dcr'] as const).map(mode => <option key={mode} value={mode}>{t(mode)}</option>)}
      </select></label>
      <label style={stack}>{t('secret')}<Input type="password" autoComplete="new-password" value={secret} disabled={busy} onChange={event => setSecret(event.target.value)} /></label>
      <details open={advanced} onToggle={event => setAdvanced(event.currentTarget.open)}><summary>{t('advanced')}</summary><div style={stack}>
        <label style={stack}>{t('id')}<Input value={draft.id} disabled={busy || editing} onChange={event => { setCustomId(true); setDraft({ ...draft, id: event.target.value }) }} /></label>
        <label style={stack}>{t('metadataUrl')}<Input value={draft.metadataUrl} disabled={busy} onChange={event => setDraft({ ...draft, metadataUrl: event.target.value })} /></label>
        {numeric.map(key => <label style={stack} key={key}>{t(key)}<Input type="number" value={draft[key]} onChange={event => setDraft({ ...draft, [key]: Number(event.target.value) })} /></label>)}</div></details>
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
