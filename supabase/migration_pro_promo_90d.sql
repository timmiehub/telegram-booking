-- Неиспользованные промокоды BOOK*: 90 дней Pro (3 месяца).
-- Уже использованные не трогаем.
-- Выполнить в Supabase SQL Editor один раз.

update public.pro_promo_codes
set days = 90
where used_at is null;
