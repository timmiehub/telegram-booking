/**
 * Применить migration_yclients_features.sql через PostgREST/SQL не получится без service role.
 * Этот скрипт вызывает Management SQL через postgres REST, если задан SUPABASE_DB_URL
 * или через supabase-js rpc — для DDL нужен прямой Postgres.
 *
 * Usage (когда есть connection string):
 *   set SUPABASE_DB_URL=postgresql://postgres:...@db.xxx.supabase.co:5432/postgres
 *   node scripts/apply_yclients_migration.mjs
 *
 * Иначе: откройте Desktop/migration_yclients_features.sql в Supabase SQL Editor → Run.
 */
import { readFileSync, copyFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sqlPath = resolve(root, 'supabase/migration_yclients_features.sql')
const desktopCopy = resolve(process.env.USERPROFILE || '', 'Desktop/migration_yclients_features.sql')

const sql = readFileSync(sqlPath, 'utf8')
copyFileSync(sqlPath, desktopCopy)
console.log('SQL скопирован на Desktop:', desktopCopy)

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL
if (!dbUrl) {
  console.log(`
Нет SUPABASE_DB_URL — выполните вручную:

1. Откройте https://supabase.com/dashboard/project/jwmequerozztzpzisusa/sql/new
2. Вставьте содержимое Desktop/migration_yclients_features.sql
3. Run

Проверка после Run:
  select buffer_min from services limit 1;
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
  console.error('psql failed. Выполните SQL вручную в Dashboard.')
  process.exit(psql.status || 1)
}
console.log('Migration applied via psql OK')
