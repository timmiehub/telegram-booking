/**
 * Smoke: rollup + purge retention.
 * Usage (from bot/): node _retention_smoke.mjs
 */
import { readFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import {
  rollupMonth,
  purgeOldBookings,
  RAW_BOOKINGS_KEEP_MONTHS,
} from './dataRetention.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(
  readFileSync('./.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const desk = resolve(
  process.env.USERPROFILE || process.env.HOME || '.',
  'Desktop',
  'BookingRetention',
)
mkdirSync(desk, { recursive: true })
const sqlPath = resolve(root, 'supabase/migration_booking_stats_monthly.sql')
if (existsSync(sqlPath)) {
  copyFileSync(sqlPath, resolve(desk, 'migration_booking_stats_monthly.sql'))
}

const { data: biz } = await sb
  .from('businesses')
  .select('id, owner_profile_id')
  .not('owner_profile_id', 'is', null)
  .limit(1)
  .maybeSingle()

if (!biz?.id || !biz.owner_profile_id) {
  console.error('Smoke FAIL: нет бизнеса с owner_profile_id')
  process.exit(1)
}

const masterId = biz.owner_profile_id
const businessId = biz.id

const monthStart = new Date()
monthStart.setUTCDate(1)
monthStart.setUTCHours(0, 0, 0, 0)
const roll = await rollupMonth(sb, monthStart)
console.log('rollup:', roll)
if (!roll.ok) {
  console.error('Smoke FAIL: rollup', roll.error)
  process.exit(1)
}

if (roll.via === 'settings') {
  const { data: b2 } = await sb
    .from('businesses')
    .select('settings')
    .eq('id', businessId)
    .maybeSingle()
  const hit = b2?.settings?.stats_monthly?.[String(masterId)]?.[roll.month]
  console.log('settings agg:', hit)
  if (roll.upserted > 0 && !hit) {
    console.error('Smoke FAIL: агрегат не записался в settings')
    process.exit(1)
  }
} else if (roll.via === 'table') {
  const { data: rows } = await sb
    .from('booking_stats_monthly')
    .select('*')
    .eq('master_id', masterId)
    .eq('month', roll.month)
  console.log('table agg:', rows)
}

const ancientStart = new Date()
ancientStart.setUTCFullYear(ancientStart.getUTCFullYear() - 3)
const ancientEnd = new Date(ancientStart.getTime() + 60 * 60 * 1000)

const { data: inserted, error: insErr } = await sb
  .from('bookings')
  .insert({
    master_id: masterId,
    business_id: businessId,
    status: 'completed',
    starts_at: ancientStart.toISOString(),
    ends_at: ancientEnd.toISOString(),
    price_cents: 100,
    currency: 'RUB',
    client_telegram_id: 1,
    notes: 'retention-smoke-delete-me',
  })
  .select('id')
  .maybeSingle()

if (insErr || !inserted?.id) {
  console.error('Smoke FAIL: insert ancient', insErr?.message)
  process.exit(1)
}
console.log('inserted ancient', inserted.id)

const purged = await purgeOldBookings(sb, {
  keepMonths: RAW_BOOKINGS_KEEP_MONTHS,
  batch: 50,
})
console.log('purge:', purged)
if (!purged.ok) {
  console.error('Smoke FAIL: purge', purged.error)
  process.exit(1)
}

const { data: still } = await sb
  .from('bookings')
  .select('id')
  .eq('id', inserted.id)
  .maybeSingle()

if (still?.id) {
  console.error('Smoke FAIL: ancient booking still present', still.id)
  await sb.from('bookings').delete().eq('id', inserted.id)
  process.exit(1)
}

console.log('Smoke OK')
console.log(
  'SQL (если таблицы ещё нет): Desktop/BookingRetention/migration_booking_stats_monthly.sql → Supabase SQL Editor → Run',
)
process.exit(0)
