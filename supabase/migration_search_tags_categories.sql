-- Теги поиска + расширенные категории заведений

alter table public.businesses
  add column if not exists search_tags text[] not null default '{}';

create index if not exists businesses_search_tags_gin
  on public.businesses using gin (search_tags);

do $$ begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'business_type' and e.enumlabel = 'nails'
  ) then
    alter type public.business_type add value 'nails';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'business_type' and e.enumlabel = 'brows'
  ) then
    alter type public.business_type add value 'brows';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'business_type' and e.enumlabel = 'tattoo'
  ) then
    alter type public.business_type add value 'tattoo';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'business_type' and e.enumlabel = 'massage'
  ) then
    alter type public.business_type add value 'massage';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'business_type' and e.enumlabel = 'cosmetology'
  ) then
    alter type public.business_type add value 'cosmetology';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'business_type' and e.enumlabel = 'makeup'
  ) then
    alter type public.business_type add value 'makeup';
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on e.enumtypid = t.oid
    where t.typname = 'business_type' and e.enumlabel = 'epilation'
  ) then
    alter type public.business_type add value 'epilation';
  end if;
end $$;
