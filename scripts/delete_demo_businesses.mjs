/**
 * Удалить демо-бизнесы из Supabase (REST + service role).
 * Usage: node scripts/delete_demo_businesses.mjs
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

const url = String(env.SUPABASE_URL || '').replace(/\/$/, '')
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в bot/.env')
  process.exit(1)
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
}

const filter =
  'or=(name.ilike.*демо*барбер*,name.ilike.*иришка*)'

const listRes = await fetch(
  `${url}/rest/v1/businesses?select=id,slug,name,city,created_at&${filter}`,
  { headers },
)
if (!listRes.ok) {
  console.error('select:', listRes.status, await listRes.text())
  process.exit(1)
}
const matches = await listRes.json()
console.log('Matches:', matches?.length || 0)
for (const row of matches || []) {
  console.log(`- ${row.name} | ${row.slug} | ${row.id}`)
}

if (!matches?.length) {
  console.log('Nothing to delete')
  process.exit(0)
}

const ids = matches.map((m) => m.id)
const delRes = await fetch(
  `${url}/rest/v1/businesses?id=in.(${ids.join(',')})`,
  { method: 'DELETE', headers },
)
if (!delRes.ok) {
  console.error('delete:', delRes.status, await delRes.text())
  process.exit(1)
}

console.log(`Deleted ${ids.length} business(es)`)
