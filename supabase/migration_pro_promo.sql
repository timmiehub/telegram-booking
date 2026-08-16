-- Одноразовые промокоды Pro на 30 дней.
-- Коды: BOOK + буква по ряду QWERTY (qwertyuiopasdfghjklzxcvbnm).
-- Выполнить в Supabase SQL Editor один раз.

create table if not exists public.pro_promo_codes (
  code text primary key,
  days int not null default 30,
  used_at timestamptz,
  used_by_business_id uuid references public.businesses (id) on delete set null,
  used_by_telegram_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists pro_promo_codes_unused_idx
  on public.pro_promo_codes (code)
  where used_at is null;

alter table public.pro_promo_codes enable row level security;

drop policy if exists promo_select_all on public.pro_promo_codes;
create policy promo_select_all on public.pro_promo_codes
  for select using (true);

drop policy if exists promo_update_all on public.pro_promo_codes;
create policy promo_update_all on public.pro_promo_codes
  for update using (true);

drop policy if exists promo_insert_all on public.pro_promo_codes;
create policy promo_insert_all on public.pro_promo_codes
  for insert with check (true);

-- Напоминание мастеру за ~1 час (Pro)
alter table public.bookings
  add column if not exists master_reminded_1h boolean not null default false;

insert into public.pro_promo_codes (code, days)
select upper('BOOK' || letter), 30
from unnest(array[
  'q','w','e','r','t','y','u','i','o','p',
  'a','s','d','f','g','h','j','k','l',
  'z','x','c','v','b','n','m'
]) as letter
on conflict (code) do nothing;
