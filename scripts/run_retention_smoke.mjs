# Запуск smoke из корня: node scripts/run_retention_smoke.mjs
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const botDir = resolve(dirname(fileURLToPath(import.meta.url)), '../bot')
const r = spawnSync(process.execPath, ['_retention_smoke.mjs'], {
  cwd: botDir,
  stdio: 'inherit',
  shell: false,
})
process.exit(r.status ?? 1)
