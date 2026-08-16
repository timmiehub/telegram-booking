-- Скрытие прошлых визитов из кабинета клиента без физического удаления
alter table if exists public.bookings
add column if not exists hidden_by_client boolean not null default false;

create index if not exists bookings_client_hidden_idx
on public.bookings (client_telegram_id, hidden_by_client);
