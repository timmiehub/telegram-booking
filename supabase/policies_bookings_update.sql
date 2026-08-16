-- Упрощённая политика UPDATE для MVP (все статусы enum разрешены).
-- Выполнить целиком в SQL Editor.

drop policy if exists "public update booking status" on public.bookings;

create policy "public update booking status"
on public.bookings
for update
using (true)
with check (true);
