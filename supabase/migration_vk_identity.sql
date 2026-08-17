-- Поддержка VK-only пользователей: telegram_id больше не обязателен.
-- Профиль идентифицируется либо по telegram_id, либо по vk_id.

alter table if exists public.profiles
  alter column telegram_id drop not null;

-- Проверяем, что хотя бы один из ключей заполнен (для VK-only входа).
alter table if exists public.profiles
  drop constraint if exists profiles_telegram_id_notnull_old;

-- Убираем пустые строки/нулевые значения, чтобы UNIQUE не ломался.
update public.profiles set telegram_id = null where telegram_id = 0;
update public.profiles set vk_id = null where vk_id = 0;
