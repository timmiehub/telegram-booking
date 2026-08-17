-- Привязка VK-аккаунта к существующему профилю (Telegram остаётся основной идентичностью).
-- Один человек = один profiles.id, видно и в Telegram, и в VK Mini App после привязки.

alter table if exists public.profiles
add column if not exists vk_id bigint unique;

create index if not exists profiles_vk_id_idx on public.profiles (vk_id);

-- Для записей: пока храним vk_id брони отдельно от telegram_id (переходный период),
-- но обе привязаны к одному profiles.id через client_id, если он проставлен.
alter table if exists public.bookings
add column if not exists client_vk_id bigint;

create index if not exists bookings_client_vk_idx on public.bookings (client_vk_id);
