-- Город заведения (для поиска клиентами)
alter table public.businesses
  add column if not exists city text;

create index if not exists businesses_city_idx
  on public.businesses (city);

-- демо: Москва, если город пустой
update public.businesses
set city = 'Москва'
where city is null or city = '';
