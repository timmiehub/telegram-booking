-- Адрес заведения (улица, дом — для клиента при записи)
alter table public.businesses
  add column if not exists address text;
