-- Расписание мастера (jsonb work_hours)
-- Формат календаря: { "mode": "calendar", "default": {"start":"09:00","end":"20:00"}, "dates": {"2026-08-15": {"start":"09:00","end":"20:00"}} }
-- Старый weekly-формат (mon..sun) автоматически конвертируется в приложении.
-- Supabase SQL Editor → Run

alter table public.business_members
  add column if not exists work_hours jsonb not null default '{
    "mon": {"start": "09:00", "end": "20:00"},
    "tue": {"start": "09:00", "end": "20:00"},
    "wed": {"start": "09:00", "end": "20:00"},
    "thu": {"start": "09:00", "end": "20:00"},
    "fri": {"start": "09:00", "end": "20:00"},
    "sat": {"start": "09:00", "end": "20:00"},
    "sun": null
  }'::jsonb;

-- RLS: чтение для всех, запись — открыта (как services)
drop policy if exists "members_select_all" on public.business_members;
create policy "members_select_all"
  on public.business_members for select using (true);

drop policy if exists "members_update_all" on public.business_members;
create policy "members_update_all"
  on public.business_members for update using (true) with check (true);
