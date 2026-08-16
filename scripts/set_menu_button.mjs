/**
 * Установить Menu Button бота на WEBAPP_URL из bot/.env
 * Usage: node scripts/set_menu_button.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = resolve(root, 'bot/.env')
const raw = readFileSync(envPath, 'utf8')
const env = Object.fromEntries(
  raw
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const token = env.BOT_TOKEN
const url = env.WEBAPP_URL
if (!token || !url) {
  console.error('Нужны BOT_TOKEN и WEBAPP_URL в bot/.env')
  process.exit(1)
}

const body = {
  menu_button: {
    type: 'web_app',
    text: 'Открыть',
    web_app: {
      url: `${String(url).split('?')[0].replace(/\/?$/, '/')}?view=home`,
    },
  },
}

const r = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const j = await r.json()
console.log(j)
console.log('WEBAPP_URL=', url)
