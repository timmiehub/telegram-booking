-- Порядок услуг в кабинете = порядок у клиента при записи
-- Выполнить в Supabase SQL Editor после migration_services_manage.sql

alter table public.services
  add column if not exists sort_order int not null default 0;

create index if not exists services_sort_idx
  on public.services (business_id, sort_order)
  where is_active = true;

-- Backfill: по дате создания внутри business, иначе master
with ranked as (
  select
    id,
    row_number() over (
      partition by coalesce(business_id::text, master_id::text)
      order by created_at nulls last, title
    ) - 1 as rn
  from public.services
)
update public.services s
set sort_order = r.rn
from ranked r
where s.id = r.id;
