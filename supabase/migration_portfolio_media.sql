-- Портфолио + Storage bucket для авы/шапки/фото
-- Выполнить в Supabase SQL Editor один раз.

create table if not exists public.business_portfolio (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists business_portfolio_biz_idx
  on public.business_portfolio (business_id, sort_order);

alter table public.business_portfolio enable row level security;

drop policy if exists portfolio_select_all on public.business_portfolio;
create policy portfolio_select_all on public.business_portfolio
  for select using (true);

drop policy if exists portfolio_insert_all on public.business_portfolio;
create policy portfolio_insert_all on public.business_portfolio
  for insert with check (true);

drop policy if exists portfolio_delete_all on public.business_portfolio;
create policy portfolio_delete_all on public.business_portfolio
  for delete using (true);

-- Public bucket for business images (create if missing)
insert into storage.buckets (id, name, public)
values ('business-media', 'business-media', true)
on conflict (id) do update set public = true;

drop policy if exists business_media_public_read on storage.objects;
create policy business_media_public_read on storage.objects
  for select using (bucket_id = 'business-media');

drop policy if exists business_media_public_insert on storage.objects;
create policy business_media_public_insert on storage.objects
  for insert with check (bucket_id = 'business-media');

drop policy if exists business_media_public_update on storage.objects;
create policy business_media_public_update on storage.objects
  for update using (bucket_id = 'business-media');

drop policy if exists business_media_public_delete on storage.objects;
create policy business_media_public_delete on storage.objects
  for delete using (bucket_id = 'business-media');
