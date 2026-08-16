-- Напоминания клиентам (24ч / 2ч до визита)
alter table public.bookings
  add column if not exists reminded_24h boolean not null default false;

alter table public.bookings
  add column if not exists reminded_2h boolean not null default false;

create index if not exists bookings_starts_at_idx on public.bookings (starts_at);

-- Чтение для сервиса напоминаний (anon/service) — уже есть select policy using(true)
