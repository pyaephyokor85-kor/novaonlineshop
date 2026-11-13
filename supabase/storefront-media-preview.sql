-- Apply only to the isolated NOVA Preview Supabase project first.
begin;
create table if not exists public.nova_storefront_media (
 id text primary key,
 kind text not null check (kind in ('slide','product')),
 title text not null default '', description text not null default '', image_url text,
 enabled boolean not null default true, deleted boolean not null default false,
 cta text not null default 'discover' check (cta in ('discover','advisor')),
 sort_order integer not null default 0, updated_by text, updated_at timestamptz not null default now()
);
alter table public.nova_storefront_media enable row level security;
revoke all on public.nova_storefront_media from anon, authenticated;
grant all on public.nova_storefront_media to service_role;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('nova-storefront-media','nova-storefront-media',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
-- Image objects are public assets; writes go through the authenticated Admin API.
commit;
