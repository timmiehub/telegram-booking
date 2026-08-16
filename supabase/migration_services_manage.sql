-- Управление услугами из Mini App (insert/update/select всех, включая скрытые)
-- Выполнить в Supabase → SQL Editor → Run

drop policy if exists "public read active services" on public.services;
drop policy if exists services_select_all on public.services;
drop policy if exists services_insert_all on public.services;
drop policy if exists services_update_all on public.services;

create policy services_select_all
  on public.services for select
  using (true);

create policy services_insert_all
  on public.services for insert
  with check (true);

create policy services_update_all
  on public.services for update
  using (true)
  with check (true);
