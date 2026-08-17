create table if not exists public.vk_link_tokens (
  code text primary key,
  vk_id bigint not null,
  sign text not null,
  used boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists vk_link_tokens_code_idx on public.vk_link_tokens (code);
create index if not exists vk_link_tokens_vk_id_idx on public.vk_link_tokens (vk_id);

comment on table public.vk_link_tokens is 'One-time tokens for linking a VK account from VK Mini App to a Telegram user via the bot';
