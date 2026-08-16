-- Месячные агрегаты записей (живут навсегда; сырые bookings чистятся через 18 мес).
-- Выполнить в Supabase SQL Editor один раз.

create table if not exists public.booking_stats_monthly (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  master_id uuid not null references public.profiles (id) on delete cascade,
  month date not null,
  completed_count int not null default 0 check (completed_count >= 0),
  cancelled_count int not null default 0 check (cancelled_count >= 0),
  no_show_count int not null default 0 check (no_show_count >= 0),
  revenue_cents bigint not null default 0 check (revenue_cents >= 0),
  updated_at timestamptz not null default now(),
  constraint booking_stats_monthly_uniq unique (master_id, month)
);

create index if not exists booking_stats_monthly_master_month_idx
  on public.booking_stats_monthly (master_id, month desc);

create index if not exists booking_stats_monthly_business_month_idx
  on public.booking_stats_monthly (business_id, month desc);

alter table public.booking_stats_monthly enable row level security;

drop policy if exists booking_stats_monthly_select_all on public.booking_stats_monthly;
create policy booking_stats_monthly_select_all
  on public.booking_stats_monthly for select
  using (true);

-- Запись/апдейт только service_role (бот); anon не пишет.
drop policy if exists booking_stats_monthly_no_public_write on public.booking_stats_monthly;
-- Нет insert/update policy для anon → запись только через service_role, обходящий RLS.
