/**
 * Копирует migration_search_tags_categories.sql на Desktop и (если есть SUPABASE_DB_URL) применяет.
 * Usage: node scripts/apply_search_tags_migration.mjs
 */
import { copyFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sqlPath = resolve(root, 'supabase/migration_search_tags_categories.sql')
const desktop = resolve(process.env.USERPROFILE || '', 'Desktop')
const desktopSql = resolve(desktop, 'migration_search_tags_categories.sql')

copyFileSync(sqlPath, desktopSql)
console.log('SQL →', desktopSql)

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
if (!dbUrl) {
  console.log(`
Нет SUPABASE_DB_URL — выполните вручную:

1. Откройте https://supabase.com/dashboard/project/jwmequerozztzpzisusa/sql/new
2. Вставьте Desktop/migration_search_tags_categories.sql
3. Run

Проверка:
  select enumlabel from pg_enum e
  join pg_type t on e.enumtypid = t.oid
  where t.typname = 'business_type' order by enumsortorder;
  select column_name from information_schema.columns
  where table_name = 'businesses' and column_name = 'search_tags';
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
