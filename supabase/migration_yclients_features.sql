-- YCLIENTS-gap features: buffer, settings, client notes, confirm flag
-- Supabase SQL Editor → Run

alter table public.services
  add column if not exists buffer_min int not null default 0
  check (buffer_min >= 0 and buffer_min <= 60);

alter table public.businesses
  add column if not exists settings jsonb not null default '{
    "reschedule_min_hours": 24,
    "require_confirm": false
  }'::jsonb;

alter table public.bookings
  add column if not exists client_confirmed boolean not null default false;

alter table public.bookings
  add column if not exists rescheduled_from timestamptz;

alter table public.bookings
  add column if not exists notify_kind text;

alter table public.bookings
  add column if not exists notify_sent boolean not null default false;

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references public.profiles (id) on delete cascade,
  client_telegram_id bigint not null,
  note text not null default '',
  no_show_count int not null default 0 check (no_show_count >= 0),
  display_name text,
  updated_at timestamptz not null default now(),
  unique (master_id, client_telegram_id)
);

create index if not exists client_notes_master_idx
  on public.client_notes (master_id, client_telegram_id);

alter table public.client_notes enable row level security;

drop policy if exists client_notes_select_all on public.client_notes;
create policy client_notes_select_all
  on public.client_notes for select using (true);

drop policy if exists client_notes_upsert_all on public.client_notes;
create policy client_notes_upsert_all
  on public.client_notes for all using (true) with check (true);
