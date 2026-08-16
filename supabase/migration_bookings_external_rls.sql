-- Сторонние записи через бота: insert confirmed + external_source
-- Выполнить в Supabase SQL Editor после policies_bookings.sql

drop policy if exists "public insert bookings" on public.bookings;

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
