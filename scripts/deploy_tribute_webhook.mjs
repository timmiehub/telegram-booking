/**
 * Деплой постоянного Tribute webhook на Supabase Edge.
 * Нужен: SUPABASE_ACCESS_TOKEN (https://supabase.com/dashboard/account/tokens)
 * и TRIBUTE_API_KEY в bot/.env
 *
 * Usage: node scripts/deploy_tribute_webhook.mjs
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const projectRef = 'jwmequerozztzpzisusa'
const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/tribute-webhook`

function loadEnv(file) {
  if (!existsSync(file)) return {}
  const out = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    out[m[1]] = m[2].trim()
  }
  return out
}

const botEnv = loadEnv(resolve(root, 'bot/.env'))
const token = process.env.SUPABASE_ACCESS_TOKEN || botEnv.SUPABASE_ACCESS_TOKEN || ''
const tributeKey = process.env.TRIBUTE_API_KEY || botEnv.TRIBUTE_API_KEY || ''

if (!token) {
  console.error(
    'Нужен SUPABASE_ACCESS_TOKEN.\n1) https://supabase.com/dashboard/account/tokens\n2) Generate token\n3) set SUPABASE_ACCESS_TOKEN=... && node scripts/deploy_tribute_webhook.mjs',
  )
  process.exit(1)
}

if (!tributeKey) {
  console.error('Нет TRIBUTE_API_KEY в bot/.env')
  process.exit(1)
}

const env = { ...process.env, SUPABASE_ACCESS_TOKEN: token }

function run(args) {
  const safeArgs = args.map((a) =>
    /^(TRIBUTE_API_KEY|BOT_TOKEN)=/i.test(String(a))
      ? String(a).replace(/=.+$/, '=***')
      : a,
  )
  console.log('>', 'supabase', safeArgs.join(' '))
  // `--` чтобы npm не съел флаги supabase (--project-ref и т.п.)
  const r = spawnSync(
    'npm.cmd',
    ['exec', '--yes', '--', 'supabase', ...args],
    {
      cwd: root,
      env,
      encoding: 'utf8',
      shell: true,
    },
  )
  if (r.error) {
    console.error(r.error)
    process.exit(1)
  }
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)
  const code = r.status == null ? 0 : r.status
  if (code !== 0) process.exit(code)
}

run(['link', '--project-ref', projectRef, '--yes'])
run([
  'secrets',
  'set',
  `TRIBUTE_API_KEY=${tributeKey}`,
  '--project-ref',
  projectRef,
])
const botToken = process.env.BOT_TOKEN || botEnv.BOT_TOKEN || ''
if (botToken) {
  run(['secrets', 'set', `BOT_TOKEN=${botToken}`, '--project-ref', projectRef])
} else {
  console.warn(
    'BOT_TOKEN нет в bot/.env — уведомление рефереру в Telegram может не уйти',
  )
}
run([
  'functions',
  'deploy',
  'tribute-webhook',
  '--project-ref',
  projectRef,
  '--no-verify-jwt',
])

console.log('\nOK. Постоянный webhook:')
console.log(webhookUrl)
console.log('Вставь этот URL в Tribute → Webhooks.')
