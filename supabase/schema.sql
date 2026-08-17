-- Схема MVP: White Label (темы) + записи для аналитики
-- Применить в Supabase SQL Editor

-- Расширения
create extension if not exists "pgcrypto";

-- Роль пользователя в системе
create type public.user_role as enum ('master', 'client', 'admin');

-- Статус записи (нужен для cancellation rate и retention)
create type public.booking_status as enum (
  'pending',
  'confirmed',
  'completed',
  'cancelled_by_client',
  'cancelled_by_master',
  'no_show'
);

-- Стиль кнопок White Label
create type public.button_style as enum ('solid', 'outline', 'soft', 'pill');

-- ---------------------------------------------------------------------------
-- Профили (мастер / клиент), привязка к Telegram
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique not null,
  -- Привязка VK-аккаунта к тому же профилю (клиент подключает VK из Telegram Mini App)
  vk_id bigint unique,
  username text,
  full_name text,
  role public.user_role not null default 'client',
  -- Публичный slug мастера: ?master=anna-cut или start_param
  slug text unique,
  business_name text,
  avatar_url text,
  timezone text not null default 'Europe/Moscow',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_master_slug_check check (
    role <> 'master' or slug is not null
  )
);

create index profiles_role_idx on public.profiles (role);
create index profiles_slug_idx on public.profiles (slug);
create index profiles_vk_id_idx on public.profiles (vk_id);

-- ---------------------------------------------------------------------------
-- White Label: тема UI мастера
-- ---------------------------------------------------------------------------
create table public.themes (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null unique references public.profiles (id) on delete cascade,
  -- Цвета (HEX)
  primary_color text not null default '#2563eb',
  secondary_color text not null default '#0f172a',
  accent_color text not null default '#f59e0b',
  background_color text not null default '#ffffff',
  surface_color text not null default '#f8fafc',
  text_color text not null default '#0f172a',
  button_text_color text not null default '#ffffff',
  -- UI-предпочтения
  button_style public.button_style not null default 'solid',
  border_radius_px int not null default 16 check (border_radius_px between 0 and 32),
  font_family text not null default 'system-ui',
  logo_url text,
  cover_url text,
  -- Запас на будущие токены без миграций
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint themes_primary_hex check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint themes_bg_hex check (background_color ~ '^#[0-9A-Fa-f]{6}$')
);

-- ---------------------------------------------------------------------------
-- Услуги мастера (для аналитики выручки / MRR-like метрик)
-- ---------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  duration_min int not null check (duration_min > 0),
  price_cents int not null check (price_cents >= 0),
  currency text not null default 'RUB',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index services_master_idx on public.services (master_id);

-- ---------------------------------------------------------------------------
-- Записи (ядро аналитики: плотность, отмены, retention)
-- ---------------------------------------------------------------------------
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.profiles (id) on delete cascade,
  client_id uuid references public.profiles (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  status public.booking_status not null default 'pending',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_cents int not null default 0 check (price_cents >= 0),
  currency text not null default 'RUB',
  -- Для retention: повторные визиты одного клиента
  client_telegram_id bigint,
  client_vk_id bigint,
  notes text,
  cancelled_at timestamptz,
  reminded_24h boolean not null default false,
  reminded_2h boolean not null default false,
  master_notified boolean not null default false,
  hidden_by_client boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_time_check check (ends_at > starts_at)
);

create index bookings_master_starts_idx on public.bookings (master_id, starts_at);
create index bookings_master_status_idx on public.bookings (master_id, status);
create index bookings_client_idx on public.bookings (client_id);
create index bookings_client_tg_idx on public.bookings (client_telegram_id);
create index bookings_client_vk_idx on public.bookings (client_vk_id);
create index bookings_starts_at_idx on public.bookings (starts_at);

-- ---------------------------------------------------------------------------
-- View-хелперы под дашборд (Recharts на фронте агрегирует / или SQL)
-- ---------------------------------------------------------------------------

-- Дневная плотность записей по мастеру
create or replace view public.v_booking_density_daily as
select
  master_id,
  (starts_at at time zone 'UTC')::date as day,
  count(*) filter (where status in ('confirmed', 'completed', 'pending')) as booked_count,
  count(*) filter (where status in ('cancelled_by_client', 'cancelled_by_master')) as cancelled_count,
  count(*) filter (where status = 'completed') as completed_count,
  coalesce(sum(price_cents) filter (where status = 'completed'), 0) as revenue_cents
from public.bookings
group by 1, 2;

-- Месячная выручка (база для «MRR-like» графика услуг)
create or replace view public.v_revenue_monthly as
select
  master_id,
  date_trunc('month', starts_at)::date as month,
  coalesce(sum(price_cents) filter (where status = 'completed'), 0) as revenue_cents,
  count(*) filter (where status = 'completed') as completed_count,
  count(*) filter (
    where status in ('cancelled_by_client', 'cancelled_by_master')
  ) as cancelled_count
from public.bookings
group by 1, 2;

-- Retention: число визитов клиента у мастера
create or replace view public.v_client_retention as
select
  master_id,
  coalesce(client_id::text, client_telegram_id::text) as client_key,
  count(*) filter (where status = 'completed') as completed_visits,
  min(starts_at) filter (where status = 'completed') as first_visit_at,
  max(starts_at) filter (where status = 'completed') as last_visit_at
from public.bookings
group by 1, 2;

-- ---------------------------------------------------------------------------
-- Триггер updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger themes_updated_at
before update on public.themes
for each row execute function public.set_updated_at();

create trigger bookings_updated_at
before update on public.bookings
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS (базово): публичное чтение темы по slug — через view/RPC позже;
-- для MVP anon читает themes+profiles мастеров (только нужные поля на API-слое)
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.themes enable row level security;
alter table public.services enable row level security;
alter table public.bookings enable row level security;

-- Публично: читать профили мастеров (для white label по slug)
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

-- Публично: читать темы (клиент видит брендинг мастера)
create policy "public read themes"
on public.themes for select
using (true);

-- Публично: активные услуги мастера
create policy "public read active services"
on public.services for select
using (is_active = true);

-- Записи: на MVP чтение только через service role / будущий Edge Function
-- (не открываем bookings anon-ключом)

-- ---------------------------------------------------------------------------
-- Бизнесы / сотрудники (см. также migration_businesses.sql для живых БД)
-- ---------------------------------------------------------------------------
create type public.business_type as enum (
  'barbershop',
  'salon',
  'nails',
  'brows',
  'tattoo',
  'massage',
  'cosmetology',
  'makeup',
  'epilation',
  'tutor',
  'other'
);

create type public.member_role as enum ('owner', 'master');

create table public.businesses (
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

create index businesses_slug_idx on public.businesses (slug);
create index businesses_owner_idx on public.businesses (owner_profile_id);

create table public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'master',
  title text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, profile_id)
);

create index business_members_profile_idx on public.business_members (profile_id);
create index business_members_business_idx on public.business_members (business_id);

alter table public.services
  add column business_id uuid references public.businesses (id) on delete cascade;

alter table public.bookings
  add column business_id uuid references public.businesses (id) on delete cascade;

alter table public.themes
  add column business_id uuid unique references public.businesses (id) on delete cascade;

create index services_business_idx on public.services (business_id);
create index bookings_business_idx on public.bookings (business_id);

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

create policy businesses_select_all on public.businesses for select using (true);
create policy businesses_insert_all on public.businesses for insert with check (true);
create policy businesses_update_all on public.businesses for update using (true) with check (true);
create policy business_members_select_all on public.business_members for select using (true);
create policy business_members_insert_all on public.business_members for insert with check (true);
create policy business_members_update_all on public.business_members for update using (true) with check (true);

create trigger businesses_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();
