-- Открыть profiles для MVP (запись/онбординг из Mini App)
-- Выполнить в Supabase → SQL Editor → Run

drop policy if exists "public read master profiles" on public.profiles;
drop policy if exists profiles_select_all on public.profiles;
drop policy if exists profiles_insert_all on public.profiles;
drop policy if exists profiles_update_all on public.profiles;

create policy profiles_select_all
on public.profiles for select
using (true);

create policy profiles_insert_all
on public.profiles for insert
with check (true);

create policy profiles_update_all
on public.profiles for update
using (true)
with check (true);

-- Темы: создание при онбординге
drop policy if exists themes_insert_all on public.themes;
drop policy if exists themes_update_all on public.themes;
create policy themes_insert_all on public.themes for insert with check (true);
create policy themes_update_all on public.themes for update using (true) with check (true);

-- Услуги: создание при онбординге
drop policy if exists services_insert_all on public.services;
drop policy if exists services_update_all on public.services;
create policy services_insert_all on public.services for insert with check (true);
create policy services_update_all on public.services for update using (true) with check (true);
