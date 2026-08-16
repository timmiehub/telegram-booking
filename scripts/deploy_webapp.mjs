#!/usr/bin/env node
/**
 * После `npx vercel login`:
 *   node scripts/deploy_webapp.mjs
 * Деплоит webapp/ на Vercel prod и печатает URL.
 */
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const webapp = resolve(root, 'webapp')

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)
  if (r.status !== 0) {
    process.exit(r.status || 1)
  }
  return r.stdout || ''
}

console.log('Build…')
run('npm', ['run', 'build'], webapp)

console.log('Vercel deploy --prod…')
const out = run(
  'npx',
  ['--yes', 'vercel', 'deploy', '--prod', '--yes', '--cwd', webapp],
  root,
)

const urlMatch = out.match(/https:\/\/[^\s]+\.vercel\.app[^\s]*/g)
const url = urlMatch?.[urlMatch.length - 1]
if (!url) {
  console.log('Деплой завершён, но URL не распознан. Смотри вывод выше.')
  process.exit(0)
}

const webappUrl = `${url.replace(/\/$/, '')}/?business=demo`
console.log('\nWEBAPP_URL=', webappUrl)

const envPath = resolve(root, 'bot/.env')
if (existsSync(envPath)) {
  let raw = readFileSync(envPath, 'utf8')
  if (/^WEBAPP_URL=.*/m.test(raw)) {
    raw = raw.replace(/^WEBAPP_URL=.*/m, `WEBAPP_URL=${webappUrl}`)
  } else {
    raw += `\nWEBAPP_URL=${webappUrl}\n`
  }
  writeFileSync(envPath, raw)
  console.log('Обновлён bot/.env WEBAPP_URL')
}

console.log('\nДальше:')
console.log('1) node scripts/set_menu_button.mjs')
console.log('2) Privacy: ' + url.replace(/\/$/, '') + '/privacy-policy.html')
console.log('3) Перезапусти бота / задеплой bot на Railway')
