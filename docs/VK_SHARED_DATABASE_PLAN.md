# VK + Telegram на одной БД (отложено)

Статус: **не делать сейчас** — вернуться, когда скажешь «делаем VK».  
Источник: чат `VK shared DB — план (отложено)` + Cursor plan `vk_shared_database_9f51cc38`.

---

## Короткий ответ

- **Да**, данные могут совпадать: записи, услуги, расписание, кабинет — в Supabase, не привязаны к Telegram.
- **Нет**, это не «галочка»: нужен VK Mini App, канал пушей (сообщество VK) и модель «кто пользователь» (сейчас везде `telegram_id`).
- **Tribute оставляем** для Pro в Telegram: подписка → `businesses.settings` → Pro работает для бизнеса и в TG, и в VK. Клиентам VK Tribute не нужен.

## Архитектура (выбрано)

Один продукт, две оболочки, одна БД. Pro — через Tribute только в Telegram.

```text
Telegram Mini App ──┐
                    ├──► Supabase ◄── Tribute (Pro на business)
VK Mini App ────────┘         │
                              ├── Telegraf (пуши TG)
                              └── VK community messages (пуши VK, фаза 3)
```

Где делать VK: [VK Mini Apps](https://dev.vk.com/mini-apps) + опционально сообщения сообщества.  
Хостинг webapp: тот же GitHub Pages / отдельный URL в настройках VK.

---

## Что общее vs Telegram-only

| Слой | Общий | Telegram-only |
|------|--------|----------------|
| Записи, слоты, услуги, темы, Pro-флаги | да | — |
| Auth / профиль | логика почти общая | `profiles.telegram_id`, `client_telegram_id` |
| UI Mini App | React + CSS | `Telegram.WebApp`, MainButton, haptic, `openTelegramLink` |
| Уведомления | cron-логика | Telegraf `sendMessage` |
| Оплата Pro | Tribute webhook → settings | `payload.telegram_user_id` |
| Ссылки записи | парсер slug | `t.me/bot?startapp=...` |

Ключевые файлы сейчас: `bot/reminders.js`, `supabase/functions/tribute-webhook/`, `webapp/src/` (кабинет + клиент), `profiles` / bookings с `telegram_id`.

---

## Пошаговый план работ

### Фаза 0 — идентичность (обязательно до UI VK)

1. Миграция: `profiles.telegram_id` nullable + `profiles.vk_id` nullable  
   (альтернатива: таблица `profile_identities(platform, external_id)` — если захотим чище).
2. В `bookings` / `client_notes`: переходный период — держать `client_telegram_id` + добавить `client_profile_id` (или `client_vk_id`).
3. Не делать полный merge аккаунтов в MVP; заложить поля под связку позже (код/телефон).
4. **Стоп-критерий:** один человек с двумя платформами не обязан быть одним профилем в MVP, но схема это не запрещает.

### Фаза 1 — MVP: клиент VK записывается в тот же бизнес

5. Детект платформы в webapp: `Telegram.WebApp` vs `vk-bridge` (`vk_user_id` + проверка `sign` на Edge Function).
6. Адаптер `webapp/src/lib/platform.js`: user id, haptic, back button, open link.
7. Deep link VK: `vk.com/appXXXX#business=<slug>` (парсер slug уже есть).
8. Клиент из VK: услуги → слоты → запись в ту же таблицу `bookings`.
9. Уведомление мастеру — **как сейчас в Telegram** (мастер почти всегда в TG).
10. Клиенту VK — без пуша или простое сообщение от сообщества (если даст разрешение).

**Оценка фазы 1:** ~1–1.5 недели при текущем коде.

**Стоп-критерий MVP:** запись из VK видна мастеру в TG-кабинете / боте.

### Фаза 2 — кабинет мастера во VK

11. Тот же кабинет (Сегодня / ссылка / Pro UI) под `platform` adapter.
12. «Написать клиенту» без `t.me` — VK-диалог или копирование контакта.
13. Шаринг: VK share API + старая TG-ссылка.
14. Pro CTA: «оплатить в Telegram-боте» (Tribute / deep link) — **не** дублировать оплату в VK.

### Фаза 3 — пуши клиентам VK

15. Воркер рядом с `bot/`: те же флаги `reminded_24h` / `notify_*`.
16. Логику из `bot/reminders.js` переиспользовать, транспорт: VK API сообществу.
17. Не форкать весь репозиторий под VK.

---

## Что не делать

1. Полный клон репо «только под VK» — разъезд кода.
2. VK Pay вместо Tribute для Pro (пока не нужно).
3. Только «веб-ссылка без Mini App» как основной путь — слабее дистрибуция в VK.

---

## Риски

- Два ID одного клиента без merge → путаница в истории.
- Модерация VK Mini App и правила сообществ.
- Мастер только во VK без Telegram → Pro через Tribute не оплатит; онбординг «сначала бот в TG» или запасной канал позже.
- Сейчас RLS/anon + `telegram_id` с клиента — перед VK нужна серверная проверка `initData` / `sign`.

---

## Первый тикет, когда начнёте

Миграция `profiles.vk_id` + stub platform auth (без полного UI VK).

Команда в новом чате:

```text
Реализуй по docs/VK_SHARED_DATABASE_PLAN.md — начни с фазы 0.
```

---

## Чеклист «готово к старту кода»

- [ ] Приложение в кабинете VK разработчика (app id)
- [ ] URL Mini App (Pages или отдельный)
- [ ] Решение: сообщения сообщества для пушей — да/нет
- [ ] Tribute остаётся единственным Pro-каналом (подтверждено)
