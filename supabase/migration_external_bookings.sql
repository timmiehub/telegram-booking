-- Сторонние записи (YClients, Google Calendar и т.п.) через бота
alter table public.bookings
  add column if not exists external_source text;

comment on column public.bookings.external_source is
  'Источник сторонней записи, если добавлена мастером через бота (не из приложения)';

create index if not exists bookings_external_idx
  on public.bookings (master_id, starts_at)
  where external_source is not null;
