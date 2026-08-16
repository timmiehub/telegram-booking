-- Pro extras: after-visit thank-you flag, client blacklist, booking location tag
alter table public.bookings
  add column if not exists thanked_after boolean not null default false;

alter table public.bookings
  add column if not exists location_id text;

alter table public.client_notes
  add column if not exists is_blocked boolean not null default false;

comment on column public.bookings.thanked_after is 'Pro: thank-you after completed visit sent';
comment on column public.bookings.location_id is 'Optional location id from business settings.locations';
comment on column public.client_notes.is_blocked is 'Pro: client blocked from new bookings';
