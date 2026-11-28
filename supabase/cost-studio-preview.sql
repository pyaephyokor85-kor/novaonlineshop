create table public.nova_cost_studio_preview (
  owner_email text primary key,
  revision bigint not null check (revision > 0),
  ledger jsonb not null check (jsonb_typeof(ledger) = 'object')
);
alter table public.nova_cost_studio_preview enable row level security;
revoke all on public.nova_cost_studio_preview from public, anon, authenticated;
grant select, insert, update on public.nova_cost_studio_preview to service_role;
