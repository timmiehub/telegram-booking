-- Политика: клиент может скрыть только свои собственные прошлые записи
-- (booking уже завершена/отменена/no_show и принадлежит этому client_telegram_id)
drop policy if exists "client hide own past booking" on public.bookings;

create policy "client hide own past booking"
on public.bookings
for update
using (
  client_telegram_id is not null
  and client_telegram_id = (select auth.jwt() ->> 'telegram_id')::bigint
  and status in ('completed', 'cancelled_by_client', 'cancelled_by_master', 'no_show')
)
with check (
  client_telegram_id is not null
  and client_telegram_id = (select auth.jwt() ->> 'telegram_id')::bigint
);
