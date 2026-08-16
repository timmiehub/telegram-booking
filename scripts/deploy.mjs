import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const webapp = path.join(root, 'webapp')
const dist = path.join(webapp, 'dist')

const push = process.argv.includes('--push')
const noBump = process.argv.includes('--no-bump')

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function run(cmd, cwd = root) {
  return execSync(cmd, { cwd, stdio: 'inherit' })
}

function runOut(cmd, cwd = root) {
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()
}

function bail(msg) {
  console.error('❌', msg)
  process.exit(1)
}

// 1. Make sure we are on master
const branch = runOut('git branch --show-current')
if (branch !== 'master') {
  bail(`Must be on master, currently on ${branch}`)
}

// 2. Warn about dirty tree (do not block — user may have uncommitted work)
const status = runOut('git status --short')
if (status) {
  console.warn('⚠️  Незакоммиченные изменения:')
  console.warn(status)
  console.warn('Рекомендую закоммить сначала. Продолжаем через 5 секунд...')
  await wait(5000)
}

// 3. Build webapp
console.log('📦 Собираю webapp...')
process.env.VITE_BASE = '/telegram-booking/'
run('npm run build', webapp)

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  bail('webapp/dist/index.html не найден — сборка не удалась')
}

// 4. Read commit hash
const hash = runOut('git rev-parse --short HEAD')

// 5. Update bot/cache-bust.txt
if (!noBump) {
  const cacheBustFile = path.join(root, 'bot', 'cache-bust.txt')
  fs.writeFileSync(cacheBustFile, `${hash}\n`, 'utf8')
  const changed = runOut('git status --short -- bot/cache-bust.txt')
  if (changed) {
    run('git add bot/cache-bust.txt')
    run(`git commit -m "chore: bump cache-bust to ${hash}" --no-verify`)
    if (push) {
      run('git push origin master')
    }
  }
}

// 6. Switch to gh-pages and clean
console.log('🚀 Деплою на gh-pages...')
run('git fetch origin gh-pages')
run('git checkout gh-pages')

// Remove tracked gh-pages files (keep untracked source folders like webapp/bot)
run('git rm -r .')

// 7. Copy fresh build
for (const item of fs.readdirSync(dist, { withFileTypes: true })) {
  const src = path.join(dist, item.name)
  const dst = path.join(root, item.name)
  fs.cpSync(src, dst, { recursive: true, force: true })
}

// 8. Ensure .nojekyll
fs.writeFileSync(path.join(root, '.nojekyll'), '', 'utf8')

// 9. Write gh-pages .gitignore to avoid staging master source folders
const gitignoreLines = ['**', '!.nojekyll', '!.gitignore']
for (const item of fs.readdirSync(dist)) {
  const itemPath = path.join(dist, item)
  gitignoreLines.push(`!${item}`)
  if (fs.statSync(itemPath).isDirectory()) {
    gitignoreLines.push(`!${item}/**`)
  }
}
fs.writeFileSync(path.join(root, '.gitignore'), gitignoreLines.join('\n') + '\n', 'utf8')

// 9. Commit and push
run('git add -A')
const hasChanges = runOut('git status --short')
if (hasChanges) {
  run(`git commit -m "Deploy gh-pages @ ${hash}" --no-verify`)
  if (push) {
    run('git push origin gh-pages --force')
  }
} else {
  console.log('Нет изменений для gh-pages.')
}

// 10. Back to master
run('git checkout master')

console.log(push ? `✅ Деплой готов. Hash: ${hash}` : `✅ Локально готово. Для пуша запусти с флагом --push. Hash: ${hash}`)
