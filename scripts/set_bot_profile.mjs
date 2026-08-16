/**
 * Профиль бота в Telegram: имя, about, описание, команды, menu button.
 * Usage: node scripts/set_bot_profile.mjs
 *
 * Картинки описания / превью Mini App — только через @BotFather (см. папку на Desktop).
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
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
const webappUrl = (env.WEBAPP_URL || '').split('?')[0].replace(/\/?$/, '/')
if (!token) {
  console.error('Нужен BOT_TOKEN в bot/.env')
  process.exit(1)
}

/** ≤120 — профиль и шаринг ссылки */
export const SHORT_DESCRIPTION =
  'Запись к мастеру в Telegram: напишите услугу или откройте приложение. Слоты, напоминания, кабинет.'

/** ≤512 — блок «Что умеет этот бот?» в пустом чате */
export const DESCRIPTION = `Я — Чат-Менеджер «Моя запись».

Клиентам:
• запись текстом («ногти», «барбер») или в приложении
• мои визиты, отмена и перенос
• напоминание перед визитом

Мастерам:
• кабинет: расписание, услуги, ссылка на запись
• сторонние записи (YClients и др.)
• уведомления о новых визитах

Напишите услугу или нажмите «Открыть» внизу.`

export const BOT_NAME = 'Моя запись'

export const COMMANDS = [
  { command: 'start', description: 'Начать / открыть приложение' },
  { command: 'menu', description: 'Меню и выбор роли' },
  { command: 'help', description: 'Что умеет бот' },
  { command: 'app', description: 'Открыть мини-приложение' },
]

function assertLimits() {
  const sc = [...SHORT_DESCRIPTION].length
  const dc = [...DESCRIPTION].length
  if (sc > 120) throw new Error(`short_description ${sc} > 120`)
  if (dc > 512) throw new Error(`description ${dc} > 512`)
  console.log(`limits OK: short=${sc}/120, description=${dc}/512`)
}

async function api(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json()
  if (!j.ok) {
    console.error('FAIL', method, j)
    process.exit(1)
  }
  console.log('OK', method)
  return j
}

assertLimits()

await api('setMyName', { name: BOT_NAME })
await api('setMyShortDescription', { short_description: SHORT_DESCRIPTION })
await api('setMyDescription', { description: DESCRIPTION })
await api('setMyCommands', { commands: COMMANDS })

if (webappUrl) {
  await api('setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: 'Открыть',
      web_app: { url: `${webappUrl}?view=home` },
    },
  })
}

const desk = resolve(process.env.USERPROFILE || root, 'Desktop', 'BotFather_MoyaZapis')
mkdirSync(desk, { recursive: true })
const pub = resolve(root, 'webapp/public')
const files = [
  'description-picture-640x360.png',
  'description-picture-960x540.png',
  'botfather-avatar-640.png',
  'botfather-description.png',
  'preview-client.png',
  'preview-master.png',
  'preview-remind.png',
]
for (const f of files) {
  const from = resolve(pub, f)
  if (existsSync(from)) copyFileSync(from, resolve(desk, f))
}

const howto = `BotFather — «Моя запись» (@booking_inapp_bot)
Тексты и команды уже выставлены скриптом set_bot_profile.mjs.
Картинки загрузите вручную (API их не ставит).

1) Откройте @BotFather → /mybots → @booking_inapp_bot

2) Edit Bot → Edit Description Picture
   Файл: description-picture-640x360.png
   (запасной крупный: description-picture-960x540.png)

3) Edit Bot → Edit Botpic (аватар)
   Файл: botfather-avatar-640.png

4) Bot Settings → Configure Mini App
   — Enable Main Mini App, URL: ${webappUrl || 'WEBAPP_URL из bot/.env'}
   — Add Demo Photos / Media (по очереди):
     preview-client.png
     preview-master.png
     preview-remind.png

5) Проверка: откройте бота в новом чате (или удалите историю) —
   должен быть блок «Что умеет этот бот?» с картинкой и текстом.

Короткое описание (профиль):
${SHORT_DESCRIPTION}

Описание (пустой чат):
${DESCRIPTION}
`
writeFileSync(resolve(desk, 'КАК_ЗАГРУЗИТЬ.txt'), howto, 'utf8')
console.log('PACK=', desk)
console.log('WEBAPP_URL=', webappUrl || '(нет)')
