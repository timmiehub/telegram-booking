-- Roles + businesses (учреждения)
-- Выполнить в Supabase SQL Editor

create type public.business_type as enum (
  'barbershop',
  'salon',
  'tutor',
  'other'
);

create type public.member_role as enum ('owner', 'master');

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  type public.business_type not null default 'other',
  owner_profile_id uuid references public.profiles (id) on delete set null,
  avatar_url text,
  cover_url text,
  timezone text not null default 'Europe/Moscow',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists businesses_slug_idx on public.businesses (slug);
create index if not exists businesses_owner_idx on public.businesses (owner_profile_id);

create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'master',
  title text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, profile_id)
);

create index if not exists business_members_profile_idx on public.business_members (profile_id);
create index if not exists business_members_business_idx on public.business_members (business_id);

-- Связи на существующие таблицы
alter table public.services
  add column if not exists business_id uuid references public.businesses (id) on delete cascade;

alter table public.bookings
  add column if not exists business_id uuid references public.businesses (id) on delete cascade;

alter table public.themes
  add column if not exists business_id uuid unique references public.businesses (id) on delete cascade;

create index if not exists services_business_idx on public.services (business_id);
create index if not exists bookings_business_idx on public.bookings (business_id);

-- Backfill: каждый master-профиль → бизнес + membership
insert into public.businesses (slug, name, type, owner_profile_id, avatar_url, timezone)
select
  p.slug,
  coalesce(nullif(p.business_name, ''), p.full_name, p.slug),
  'barbershop'::public.business_type,
  p.id,
  p.avatar_url,
  p.timezone
from public.profiles p
where p.role = 'master'
  and p.slug is not null
  and not exists (select 1 from public.businesses b where b.slug = p.slug);

insert into public.business_members (business_id, profile_id, role, title, is_active)
select
  b.id,
  b.owner_profile_id,
  'owner'::public.member_role,
  'Мастер',
  true
from public.businesses b
where b.owner_profile_id is not null
  and not exists (
    select 1 from public.business_members m
    where m.business_id = b.id and m.profile_id = b.owner_profile_id
  );

update public.services s
set business_id = b.id
from public.businesses b
where s.business_id is null
  and s.master_id = b.owner_profile_id;

update public.bookings bk
set business_id = b.id
from public.businesses b
where bk.business_id is null
  and bk.master_id = b.owner_profile_id;

update public.themes t
set business_id = b.id
from public.businesses b
where t.business_id is null
  and t.master_id = b.owner_profile_id;

-- RLS (MVP: открыто, как и раньше)
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

drop policy if exists businesses_select_all on public.businesses;
create policy businesses_select_all on public.businesses for select using (true);

drop policy if exists businesses_insert_all on public.businesses;
create policy businesses_insert_all on public.businesses for insert with check (true);

drop policy if exists businesses_update_all on public.businesses;
create policy businesses_update_all on public.businesses for update using (true) with check (true);

drop policy if exists business_members_select_all on public.business_members;
create policy business_members_select_all on public.business_members for select using (true);

drop policy if exists business_members_insert_all on public.business_members;
create policy business_members_insert_all on public.business_members for insert with check (true);

drop policy if exists business_members_update_all on public.business_members;
create policy business_members_update_all on public.business_members for update using (true) with check (true);
