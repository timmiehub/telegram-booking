/**
 * Деплой бота на VPS по SSH (Windows/Mac/Linux).
 * 1) Заполни bot/.vps.local (см. .vps.local.example)
 * 2) На ПК: bot/stop-bot.cmd
 * 3) node scripts/deploy_bot_vps.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const require = createRequire(path.join(ROOT, 'bot', 'package.json'))
const { Client } = require('ssh2')
const VPS_FILE = path.join(ROOT, 'bot', '.vps.local')
const ENV_FILE = path.join(ROOT, 'bot', '.env')
const INSTALL_SH = path.join(ROOT, 'scripts', 'vps_install_bot.sh')
const BOT_DIR = path.join(ROOT, 'bot')
const SHARED_DIR = path.join(ROOT, 'shared')
const TAR_PATH = path.join(ROOT, 'scripts', '.bot-deploy.tgz')

function buildTarball() {
  if (fs.existsSync(TAR_PATH)) fs.unlinkSync(TAR_PATH)
  const tar = process.platform === 'win32' ? 'tar.exe' : 'tar'
  execFileSync(
    tar,
    [
      '-czf',
      TAR_PATH,
      '--exclude=bot/node_modules',
      '--exclude=bot/.env',
      '--exclude=bot/.bot.pid',
      '--exclude=bot/.vps.local',
      '--exclude=bot/*.log',
      '-C',
      ROOT,
      'bot',
      'shared',
    ],
    { stdio: 'inherit' },
  )
}

function parseLocalEnv(filePath) {
  const out = {}
  if (!fs.existsSync(filePath)) return out
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim()
  }
  return out
}

function exec(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, (err, stream) => {
      if (err) return reject(err)
      let out = ''
      stream
        .on('close', (code) => {
          if (code !== 0) reject(new Error(`exit ${code}: ${out.slice(-2000)}`))
          else resolve(out)
        })
        .on('data', (d) => {
          const s = d.toString()
          out += s
          process.stdout.write(s)
        })
      stream.stderr.on('data', (d) => process.stderr.write(d.toString()))
    })
  })
}

function upload(conn, localPath, remotePath, mode = 0o600) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err)
      let data = fs.readFileSync(localPath)
      if (remotePath.endsWith('.sh')) {
        data = Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
      }
      const ws = sftp.createWriteStream(remotePath, { mode })
      ws.on('close', resolve)
      ws.on('error', reject)
      ws.end(data)
    })
  })
}

async function main() {
  buildTarball()

  const vps = parseLocalEnv(VPS_FILE)
  const host = vps.VPS_HOST
  const user = vps.VPS_USER || 'root'
  const password = vps.VPS_PASS

  if (!host || !password) {
    console.error('Создай bot/.vps.local — см. bot/.vps.local.example')
    process.exit(1)
  }
  if (!fs.existsSync(ENV_FILE)) {
    console.warn('⚠️  Нет bot/.env локально. Будет использован .env на сервере, если он есть.')
  }
  if (!fs.existsSync(INSTALL_SH)) {
    console.error('Нет scripts/vps_install_bot.sh')
    process.exit(1)
  }

  const conn = new Client()
  const isV6 = host.includes(':')
  const connectOpts = {
    host,
    port: 22,
    username: user,
    password,
    readyTimeout: 30000,
    ...(isV6 ? { family: 6 } : {}),
  }
  await new Promise((resolve, reject) => {
    conn
      .on('ready', resolve)
      .on('error', reject)
      .connect(connectOpts)
  })

  console.log(`\n==> Подключено к ${host}\n`)

  try {
    await exec(conn, 'apt-get update -y && apt-get install -y git curl || true')
    await exec(
      conn,
      'command -v node >/dev/null || (curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs)',
    )

    await exec(conn, 'mkdir -p /root/telegram-booking')
    await upload(conn, TAR_PATH, '/root/telegram-booking/bot-deploy.tgz', 0o644)
    await exec(
      conn,
      'cd /root/telegram-booking && tar -xzf bot-deploy.tgz && rm -f bot-deploy.tgz',
    )

    if (fs.existsSync(ENV_FILE)) {
      await upload(conn, ENV_FILE, '/root/telegram-booking/bot/.env', 0o600)
    } else {
      console.log('  -> .env не залит, проверяю, что он уже есть на сервере...')
    }
    await exec(conn, 'mkdir -p /root/telegram-booking/scripts')
    await upload(conn, INSTALL_SH, '/root/telegram-booking/scripts/vps_install_bot.sh', 0o755)

    await exec(conn, 'bash /root/telegram-booking/scripts/vps_install_bot.sh')
    console.log('\n==> Готово. Проверь @booking_inapp_bot /start\n')
  } finally {
    conn.end()
    try {
      if (fs.existsSync(TAR_PATH)) fs.unlinkSync(TAR_PATH)
    } catch {
      /* ignore */
    }
  }
}

main().catch((e) => {
  console.error('\nОшибка:', e.message || e)
  process.exit(1)
})
