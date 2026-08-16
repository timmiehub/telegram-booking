-- Разрешаем клиенту видеть занятость и создавать запись (MVP).
-- Выполнить в SQL Editor один раз.

drop policy if exists "public read bookings for availability" on public.bookings;
drop policy if exists "public insert bookings" on public.bookings;

create policy "public read bookings for availability"
on public.bookings for select
using (status in ('pending', 'confirmed', 'completed'));

create policy "public insert bookings"
on public.bookings for insert
with check (
  ends_at > starts_at
  and (
    status = 'pending'
    or (
      status = 'confirmed'
      and external_source is not null
      and trim(external_source) <> ''
    )
  )
);
