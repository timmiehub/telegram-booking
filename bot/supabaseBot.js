/**
 * Supabase для бота: service_role обязателен для записи (обход RLS безопасно на сервере).
 */
import { createClient } from '@supabase/supabase-js'

let warnedAnon = false

export function getBotSupabase({ write = false } = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey =
    process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!url) return null

  if (write) {
    if (!serviceKey) {
      console.error(
        '[BOT] SUPABASE_SERVICE_ROLE_KEY обязателен для insert/update. Добавьте в bot/.env',
      )
      return null
    }
    return createClient(url, serviceKey)
  }

  const key = serviceKey || anonKey
  if (!key) return null
  if (!serviceKey && !warnedAnon) {
    console.warn('[BOT] Нет SUPABASE_SERVICE_ROLE_KEY — часть операций может упасть на RLS')
    warnedAnon = true
  }
  return createClient(url, key)
}
