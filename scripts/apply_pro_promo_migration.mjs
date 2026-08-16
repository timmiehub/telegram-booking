/**
 * Копирует migration_pro_promo.sql на Desktop и (если есть SUPABASE_DB_URL) применяет.
 * Usage: node scripts/apply_pro_promo_migration.mjs
 */
import { readFileSync, copyFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sqlPath = resolve(root, 'supabase/migration_pro_promo.sql')
const desktop = resolve(process.env.USERPROFILE || '', 'Desktop')
const desktopSql = resolve(desktop, 'migration_pro_promo.sql')
const codesTxt = resolve(desktop, 'PROMO_CODES_BOOK.txt')

const PREFIX = 'BOOK'
const SUFFIXES = 'qwertyuiopasdfghjklzxcvbnm'
const codes = [...SUFFIXES].map((ch) => `${PREFIX}${ch.toUpperCase()}`)

copyFileSync(sqlPath, desktopSql)
writeFileSync(
  codesTxt,
  [
    'Одноразовые промокоды Pro на 30 дней.',
    'Формат: BOOK + буква QWERTY.',
    'Каждый код — только один раз.',
    '',
    ...codes,
    '',
  ].join('\n'),
  'utf8',
)

console.log('SQL →', desktopSql)
console.log('Список кодов →', codesTxt)
console.log(codes.join(', '))

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
if (!dbUrl) {
  console.log(`
Нет SUPABASE_DB_URL — выполните вручную:

1. Откройте https://supabase.com/dashboard/project/jwmequerozztzpzisusa/sql/new
2. Вставьте Desktop/migration_pro_promo.sql
3. Run

Проверка:
  select code, used_at from pro_promo_codes order by code;
`)
  process.exit(0)
}

const psql = spawnSync('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-f', sqlPath], {
  encoding: 'utf8',
  shell: true,
})
process.stdout.write(psql.stdout || '')
process.stderr.write(psql.stderr || '')
if (psql.status !== 0) {
  console.error('psql failed — выполните SQL вручную в Dashboard.')
  process.exit(psql.status || 1)
}
console.log('Migration applied via psql OK')
