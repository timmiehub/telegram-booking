# Telegram Booking — система записи через Telegram

Приложение для онлайн-записи клиентов к мастерам/специалистам прямо в Telegram: бот + Mini App.

## Структура проекта

- **bot/** — Telegram бот (обрабатывает команды, напоминания, уведомления)
- **webapp/** — Mini App на React (кабинет мастера, форма записи клиента)
- **supabase/** — база данных и миграции
- **shared/** — общий код между bot и webapp
- **scripts/** — вспомогательные скрипты (деплой, миграции)

## Технологии

| Часть | Технологии |
|---|---|
| Bot | Node.js, Telegraf, Supabase, node-cron |
| Webapp | React 19, Vite, Tailwind CSS, Telegram SDK |
| База данных | Supabase (PostgreSQL) |

## Быстрый старт

### 1. Настройка переменных окружения

Скопируйте примеры и заполните своими ключами:

```bash
cp bot/.env.example bot/.env
cp webapp/.env.example webapp/.env
```

Нужные ключи и где их взять:
- `BOT_TOKEN` — у [@BotFather](https://t.me/BotFather) в Telegram
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — в [Supabase Dashboard](https://supabase.com/dashboard) → Settings → API
- `GEMINI_API_KEY` — в [Google AI Studio](https://aistudio.google.com/app/apikey)

### 2. Установка зависимостей

```bash
cd bot && npm install
cd ../webapp && npm install
```

### 3. Запуск бота

```bash
cd bot
npm start
```

**Важно:** нельзя запускать бота дважды одновременно — Telegram заблокирует за это (ошибка 409). Перед повторным запуском убедитесь, что старый процесс остановлен.

### 4. Запуск веб-приложения (для разработки)

```bash
cd webapp
npm run dev
```

Приложение будет доступно на `http://localhost:5173`.

## Проверка кода

**Тесты:**
```bash
cd webapp
npm test
```

**Проверка на ошибки (линтер):**
```bash
cd bot && npm run lint
cd webapp && npm run lint
```

## Логи

Логи бота сохраняются в `bot/logs/`:
- `error.log` — только ошибки
- `combined.log` — все события

## Безопасность

- Никогда не публикуйте файлы `.env` — там хранятся секретные ключи
- Если ключ случайно попал в открытый доступ — немедленно отзовите его в соответствующем сервисе и создайте новый
- `.env` файлы уже добавлены в `.gitignore` и не попадают в Git

## Дополнительно

Подробные технические правила и ограничения Telegram API — в файле `AGENTS.md`.
