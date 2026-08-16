/**
 * Стабильный HTTPS для Mini App через GitHub Pages.
 * Usage: node scripts/deploy_pages.mjs
 */
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  mkdtempSync,
  cpSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const webapp = resolve(root, 'webapp')
const repoName = process.env.PAGES_REPO || 'telegram-booking'
const owner = process.env.PAGES_OWNER || 'timmiehub'
const base = `/${repoName}/`

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || root,
    encoding: 'utf8',
    shell: opts.shell ?? false,
    env: { ...process.env, ...opts.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)
  if (r.status !== 0 && !opts.allowFail) {
    console.error('FAIL', cmd, args.join(' '))
    process.exit(r.status || 1)
  }
  return r
}

console.log('Repo:', `${owner}/${repoName}`)
const view = run('gh', ['repo', 'view', `${owner}/${repoName}`], {
  allowFail: true,
  shell: true,
})
if (view.status !== 0) {
  console.log('Creating repo…')
  run(
    'gh',
    ['repo', 'create', repoName, '--public', '--description=Telegram-booking-Mini-App'],
    { shell: true },
  )
}

console.log('Build with base', base)
run('npm', ['run', 'build'], {
  cwd: webapp,
  env: { VITE_BASE: base },
  shell: true,
})

const dist = resolve(webapp, 'dist')
const tmp = mkdtempSync(resolve(tmpdir(), 'booking-pages-'))
cpSync(dist, tmp, { recursive: true })
writeFileSync(resolve(tmp, '.nojekyll'), '')

/** Не нужны в Mini App runtime — убираем с Pages (вес/трафик). Файлы в репо остаются. */
const PAGES_STRIP = [
  'promo',
  'botfather-avatar-640.png',
  'botfather-description.png',
  'description-picture-640x360.png',
  'description-picture-960x540.png',
  'preview-client.png',
  'preview-master.png',
  'preview-remind.png',
  'preview-pro-gift.html',
  'cover-demo.png',
  'cover-demo.webp',
  'avatar-demo.png',
  'avatar-demo.webp',
  'empty-clients.png',
  'empty-clients.webp',
  'empty-day.png',
  'empty-day.webp',
  'empty-slots.png',
  'empty-slots.webp',
  'hero-gate.png',
  'hero-gate-v2.png',
  'hero-gate.svg',
  'success-check.png',
  'success-check.webp',
]
let stripped = 0
for (const name of PAGES_STRIP) {
  const p = resolve(tmp, name)
  if (!existsSync(p)) continue
  rmSync(p, { recursive: true, force: true })
  stripped += 1
}
if (stripped) console.log('Stripped unused assets from Pages:', stripped)

run('git', ['init'], { cwd: tmp })
run('git', ['checkout', '-b', 'gh-pages'], { cwd: tmp })
run('git', ['add', '-A'], { cwd: tmp })
run(
  'git',
  [
    '-c',
    'user.email=pages@local',
    '-c',
    'user.name=PagesDeploy',
    'commit',
    '-m',
    'deploy',
  ],
  { cwd: tmp },
)
run(
  'git',
  ['remote', 'add', 'origin', `https://github.com/${owner}/${repoName}.git`],
  { cwd: tmp },
)
run('git', ['push', '-f', 'origin', 'gh-pages'], { cwd: tmp, shell: true })

console.log('Enable GitHub Pages…')
run(
  'gh',
  [
    'api',
    '--method',
    'POST',
    `repos/${owner}/${repoName}/pages`,
    '-f',
    'build_type=legacy',
    '-f',
    'source[branch]=gh-pages',
    '-f',
    'source[path]=/',
  ],
  { allowFail: true, shell: true },
)
run(
  'gh',
  [
    'api',
    '--method',
    'PUT',
    `repos/${owner}/${repoName}/pages`,
    '-f',
    'build_type=legacy',
    '-f',
    'source[branch]=gh-pages',
    '-f',
    'source[path]=/',
  ],
  { allowFail: true, shell: true },
)

const site = `https://${owner}.github.io/${repoName}/`
const webappUrl = site
console.log('\nSITE=', site)
console.log('WEBAPP_URL=', webappUrl)

const envPath = resolve(root, 'bot/.env')
if (existsSync(envPath)) {
  let raw = readFileSync(envPath, 'utf8')
  if (/^WEBAPP_URL=.*/m.test(raw)) {
    raw = raw.replace(/^WEBAPP_URL=.*/m, `WEBAPP_URL=${webappUrl}`)
  } else {
    raw += `\nWEBAPP_URL=${webappUrl}\n`
  }
  writeFileSync(envPath, raw)
  console.log('Updated bot/.env')
}

rmSync(tmp, { recursive: true, force: true })
console.log('\nNext: node scripts/set_menu_button.mjs')
