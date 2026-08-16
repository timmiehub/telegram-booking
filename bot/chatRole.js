/**
 * Режим чата: client | master. От этого зависят ответы ассистента.
 * Хранится в памяти + файл, чтобы не сбрасывалось при рестарте.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const STORE_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '.chat-roles.json',
)

/** @type {Map<string, 'client' | 'master'>} */
const roles = new Map()

function load() {
  try {
    if (!fs.existsSync(STORE_PATH)) return
    const raw = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'))
    if (raw && typeof raw === 'object') {
      for (const [k, v] of Object.entries(raw)) {
        if (v === 'client' || v === 'master') roles.set(String(k), v)
      }
    }
  } catch {
    /* ignore */
  }
}

function save() {
  try {
    const obj = Object.fromEntries(roles)
    fs.writeFileSync(STORE_PATH, JSON.stringify(obj, null, 0), 'utf8')
  } catch (err) {
    console.warn('[chatRole] save:', err.message)
  }
}

load()

export function getChatRole(telegramId) {
  if (telegramId == null) return null
  return roles.get(String(telegramId)) || null
}

export function setChatRole(telegramId, role) {
  if (telegramId == null) return
  if (role !== 'client' && role !== 'master') return
  roles.set(String(telegramId), role)
  save()
}

export function roleLabel(role) {
  if (role === 'master') return 'исполнитель'
  if (role === 'client') return 'клиент'
  return 'не выбран'
}

/**
 * Эффективная роль для ассистента.
 * Явный выбор кнопкой важнее; иначе кабинет → master, иначе client.
 */
export function resolveEffectiveRole(telegramId, { hasCabinet = false } = {}) {
  const chosen = getChatRole(telegramId)
  if (chosen) return chosen
  return hasCabinet ? 'master' : 'client'
}
