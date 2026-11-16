/** Launch a packed plugin in an isolated, published official DSH installation. */
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
const root = await mkdtemp(join(tmpdir(), 'dsh-mcp-oauth-acceptance-'))
const artifacts = join(root, 'packages'); await mkdir(artifacts)
const env = { ...process.env, DSH_HOME: join(root, 'home') }
function run(args) {
  const result = spawnSync('pnpm', args, { env, stdio: 'inherit' })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
run(['pack', '--pack-destination', artifacts])
run(['exec', 'dsh', 'web', '--help'])
run(['exec', 'dsh', 'plugin', '--profile', 'web', 'add', join(artifacts, 'dsh-mcp-oauth-0.1.0.tgz')])
console.log(`Isolated acceptance home: ${env.DSH_HOME}`)
const fixture = spawn('pnpm', ['exec', 'tsx', resolve('tests/serve-fixture.ts')], { env, stdio: 'inherit' })
const web = spawn('pnpm', ['exec', 'dsh', 'web', '--no-open', '--port', '0'], { env, stdio: 'inherit' })
let closing = false
function close() { if (closing) return; closing = true; fixture.kill('SIGTERM'); web.kill('SIGTERM') }
process.once('SIGINT', close); process.once('SIGTERM', close)
web.once('exit', close); fixture.once('exit', close)
