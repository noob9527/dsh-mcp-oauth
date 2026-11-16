/** Checks public source and package contents; this is not a comprehensive secret scanner. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const failures = [];
const fail = (path, reason) => failures.push(`${path}: ${reason}`);
const forbidden = /(?:^|\/)(?:node_modules|artifacts|coverage|\.git)(?:\/|$)|(?:^|\/)\.env(?:\..*)?$|(?:^|\/)\.npmrc$|\.(?:pem|key|p12|pfx|tgz|log)$/i;
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['API key', /\bsk-[A-Za-z0-9]{32,}\b/],
  ['developer home path', new RegExp('/' + '(?:Users|home)/[A-Za-z0-9_.-]+/')],
];
function inspect(path, content) {
  if (forbidden.test(path) && !path.endsWith('.env.example')) fail(path, 'excluded publication file');
  for (const [label, pattern] of patterns) if (pattern.test(content)) fail(path, label);
}
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
for (const path of files) if (existsSync(path)) inspect(path, readFileSync(path, 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
if (pkg.license !== 'MIT') fail('package.json', 'expected MIT license');
if (!readFileSync('LICENSE', 'utf8').startsWith('MIT License')) fail('LICENSE', 'expected MIT license text');
for (const path of ['README.md', 'README.zh.md', 'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'docs/releasing.md']) {
  if (!existsSync(path)) fail(path, 'missing public documentation');
}
for (const [name, version] of Object.entries(pkg.peerDependencies)) {
  if (name.startsWith('@deepseek-ai/dsh-') && version !== pkg.engines.dsh) fail('package.json', `inconsistent compatibility: ${name}`);
}
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--tarball')) throw new Error('Usage: node scripts/check-release.mjs [--tarball path]');
if (args.length) {
  const archive = args[1];
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n').filter(path => !path.endsWith('/'));
  const allowed = /^package\/(?:lib\/|docs\/|package\.json$|cordis\.patch\.yml$|README(?:\.zh)?\.md$|LICENSE$|CHANGELOG\.md$|CONTRIBUTING\.md$|SECURITY\.md$)/;
  for (const path of entries) {
    if (!allowed.test(path) || path.split('/').includes('..')) fail(path, 'unexpected package entry');
    inspect(path, execFileSync('tar', ['-xOf', archive, path], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }));
  }
  for (const path of ['package.json', 'LICENSE', 'lib/index.js', 'lib/client.js', 'lib/types/index.d.ts', 'cordis.patch.yml']) {
    if (!entries.includes(`package/${path}`)) fail(path, 'missing package entry');
  }
  const packed = JSON.parse(execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }));
  if (packed.license !== 'MIT' || packed.version !== pkg.version) fail(archive, 'package metadata differs');
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log('Public source and requested package hygiene checks passed.');
