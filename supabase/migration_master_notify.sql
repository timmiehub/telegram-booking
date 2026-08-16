-- Пуш мастеру о новой записи + флаги напоминаний (идемпотентность)
alter table public.bookings
  add column if not exists reminded_24h boolean not null default false;

alter table public.bookings
  add column if not exists reminded_2h boolean not null default false;

alter table public.bookings
  add column if not exists master_notified boolean not null default false;

create index if not exists bookings_starts_at_idx on public.bookings (starts_at);
create index if not exists bookings_master_notified_idx
  on public.bookings (master_notified, created_at)
  where master_notified = false;
