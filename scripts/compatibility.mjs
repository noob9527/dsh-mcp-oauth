/** Audit published DSH peers, then typecheck/build/test each viable version in a private temporary root. */
import { mkdtemp, readFile, writeFile, cp, mkdir, open, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const source = fileURLToPath(new URL('../', import.meta.url))
const pkg = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
const versions = [
  '0.2.0-rc.1', '0.2.0-rc.2',
  ...Array.from({ length: 5 }, (_, i) => `0.2.1-alpha.${i + 1}`),
  ...Array.from({ length: 5 }, (_, i) => `0.2.1-rc.${i + 1}`),
  '0.2.2-alpha.2', '0.2.2-alpha.3', '0.2.2-rc.1', '0.2.2-rc.2', '0.2.2-rc.3',
]
const selected = process.argv.slice(2)
if (selected.some(version => !versions.includes(version))) throw new Error('Pass only versions listed in this compatibility matrix')
const root = await mkdtemp(join(tmpdir(), 'dsh-compatibility-'))
const names = [...new Set(['@deepseek-ai/dsh', ...Object.keys(pkg.peerDependencies), ...Object.keys(pkg.devDependencies).filter(name => name.startsWith('@deepseek-ai/'))])]
const records = Object.fromEntries(await Promise.all(names.map(async name => {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Registry lookup failed for ${name}: ${response.status}`)
  return [name, await response.json()]
})))
const report = { checkedAt: new Date().toISOString(), pluginVersion: pkg.version, versions: [] }
const persist = () => writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`Private compatibility evidence: ${root}`)
async function run(cwd, label, command, args, env) {
  const log = await open(join(cwd, `${label}.log`), 'w', 0o600)
  let timedOut = false
  try {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', log.fd, log.fd], detached: process.platform !== 'win32' })
    const timer = setTimeout(() => {
      timedOut = true
      if (process.platform === 'win32') child.kill('SIGKILL')
      else process.kill(-child.pid, 'SIGKILL')
    }, 600_000)
    const result = await new Promise((done, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => done({ code, signal }))
    }).finally(() => clearTimeout(timer))
    if (timedOut || result.code !== 0 || result.signal) throw new Error(`${label}: code=${result.code}, signal=${result.signal}, timedOut=${timedOut}`)
  } finally { await log.close() }
}
for (const version of selected.length ? selected : versions) {
  const missing = names.filter(name => name.startsWith('@deepseek-ai/dsh-') && !records[name].versions[version])
  const row = { version, missing, status: missing.length ? 'unsupported-published-peers' : 'pending', checks: [] }
  report.versions.push(row)
  if (missing.length) { console.log(version, row.status, missing.join(', ')); await persist(); continue }
  const cwd = join(root, version); await mkdir(cwd)
  const dependencies = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.devDependencies }
  for (const name of Object.keys(dependencies)) if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) dependencies[name] = version
  dependencies['@deepseek-ai/cordis'] = records['@deepseek-ai/dsh'].versions[version].dependencies['@deepseek-ai/cordis']
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'compatibility-fixture', private: true, type: 'module', dependencies }))
  for (const path of ['src', 'tests', 'scripts/build.mjs', 'tsconfig.json', 'tsconfig.build.json']) await cp(join(source, path), join(cwd, path), { recursive: true })
  // Model keys and existing DSH homes are not inherited by these keyless fixtures.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(DSH_|DEEPSEEK_|OPENAI_|ANTHROPIC_)/.test(key)))
  env.DSH_HOME = join(cwd, 'home'); env.DSH_TELEMETRY_DISABLED = '1'
  const commands = [
    ['install', 'pnpm', ['install', '--ignore-scripts', '--registry=https://registry.npmjs.org']],
    ['typecheck', 'pnpm', ['exec', 'tsc', '--noEmit']],
    ['test', 'pnpm', ['exec', 'tsx', '--test', ...(await readdir(join(cwd, 'tests'))).filter(name => name.endsWith('.test.ts')).map(name => `tests/${name}`)]],
    ['build', 'node', ['scripts/build.mjs']],
    ['official-cli', 'pnpm', ['exec', 'dsh', 'web', '--help']],
  ]
  try {
    for (const [label, command, args] of commands) {
      await run(cwd, label, command, args, env); row.checks.push(label); console.log(version, label, 'passed')
    }
    row.status = 'automated-passed'
  } catch (error) { row.status = 'failed'; row.error = String(error); process.exitCode = 1 }
  await persist()
}
console.log('Completed. Unsupported peers are rejected before runtime; automated passes do not certify browser, model, or Desktop acceptance.')
