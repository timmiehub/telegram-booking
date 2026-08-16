# Правила для агента - Telegram Booking Project

## Работа с Telegram (КРИТИЧНО)

- **КРИТИЧНО**: Никогда не запускать несколько экземпляров бота одновременно — Telegram блокирует за множественный polling (ошибка 409 Conflict)
- **КРИТИЧНО**: Нельзя использовать Webhook и Long polling одновременно
- **КРИТИЧНО**: Перед запуском бота проверять, не запущен ли уже процесс (проверка PID, .bot.pid файл)
- Использовать `acquireSingleInstanceLock()` из `telegramSafety.js` для защиты от повторного запуска
- **Rate limits**: не более 30 сообщений в секунду бесплатно (до 1000 за плату 0.1 Star/сообщение)
- При массовой рассылке использовать задержки и разбивать на batches
- Обрабатывать ошибки 429 (Too Many Requests) с exponential backoff
- Лимиты файлов: отправка до 50MB, getFile до 20MB
- Updates хранятся на сервере не более 24 часов
- Запрещено обходить rate limits и модерацию через proxy

## Специфика проекта

- Bot использует Long polling (не Webhook)
- Webapp — Telegram Mini App на React + Vite
- База данных — Supabase
- Logger — Winston для bot, кастомный для webapp
- Cron jobs для напоминаний, retention, пуш

## Приоритеты разработки

1. Безопасность → 2. Telegram правила → 3. Функциональность → 4. UI/UX