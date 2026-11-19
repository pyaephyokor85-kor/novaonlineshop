-- Apply to the isolated NOVA Preview project first, then production after review.
-- No changes to orders, payments, stock, authentication, or existing media records.
begin;
create table if not exists public.nova_sample_campaigns (
 month text primary key check (month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
 settings jsonb not null,
 enabled boolean not null default false,
 revision integer not null default 0 check (revision >= 0),
 updated_by text,
 updated_at timestamptz not null default now()
);
create table if not exists public.nova_sample_applications (
 id uuid primary key,
 campaign_month text not null references public.nova_sample_campaigns(month),
 campaign_revision integer not null,
 campaign_snapshot jsonb not null,
 customer_name text not null check (char_length(customer_name) between 1 and 120),
 phone text not null check (phone ~ '^[0-9]{7,15}$'),
 address text not null check (char_length(address) between 1 and 500),
 scent_codes text[] not null,
 request_key text not null unique,
 status text not null default 'pending' check (status in ('pending','approved','declined','shipped')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 updated_by text,
 unique(campaign_month,phone)
);
create index if not exists nova_sample_month_created_idx on public.nova_sample_applications(campaign_month,created_at desc);
alter table public.nova_sample_campaigns enable row level security;
alter table public.nova_sample_applications enable row level security;
revoke all on public.nova_sample_campaigns,public.nova_sample_applications from anon,authenticated;
grant select,insert,update on public.nova_sample_campaigns,public.nova_sample_applications to service_role;

create or replace function public.save_nova_sample_campaign(p_month text,p_revision integer,p_enabled boolean,p_settings jsonb,p_actor text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.nova_sample_campaigns%rowtype;
begin
 if p_month is null or p_revision is null or p_settings is null or p_month !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or p_revision < 0
   or coalesce(char_length(trim(p_settings->>'title')),0) not between 1 and 120
   or coalesce(char_length(trim(p_settings->>'rules')),0) not between 1 and 4000
   or jsonb_typeof(p_settings->'title') is distinct from 'string'
   or jsonb_typeof(p_settings->'rules') is distinct from 'string'
   or jsonb_typeof(p_settings->'selectionCount') is distinct from 'number'
   or jsonb_typeof(p_settings->'codes') is distinct from 'array'
 then raise exception 'INVALID_SELECTION'; end if;
 if jsonb_array_length(p_settings->'codes') not between 1 and 32
   or (p_settings->>'selectionCount')::integer not between 1 and least(10,jsonb_array_length(p_settings->'codes'))
   or exists(select 1 from jsonb_array_elements_text(p_settings->'codes') as codes(code) where code !~ '^NV-(00[1-9]|0[12][0-9]|03[0-2])$')
   or (select count(distinct code) from jsonb_array_elements_text(p_settings->'codes') as codes(code)) <> jsonb_array_length(p_settings->'codes')
   or (p_settings->>'capacity' is not null and (p_settings->>'capacity')::integer not between 1 and 50000)
 then raise exception 'INVALID_SELECTION'; end if;
 insert into public.nova_sample_campaigns(month,settings) values(p_month,p_settings) on conflict(month) do nothing;
 select * into c from public.nova_sample_campaigns where month=p_month for update;
 if c.revision <> p_revision then raise exception 'CAMPAIGN_CHANGED'; end if;
 update public.nova_sample_campaigns set settings=p_settings,enabled=p_enabled,revision=c.revision+1,updated_by=p_actor,updated_at=clock_timestamp() where month=p_month returning * into c;
 return to_jsonb(c);
end $$;

create or replace function public.create_nova_sample_application(p_id uuid,p_month text,p_revision integer,p_name text,p_phone text,p_address text,p_codes text[],p_request_key text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare c public.nova_sample_campaigns%rowtype; a public.nova_sample_applications%rowtype; capacity integer;
begin
 -- Serialize submissions per campaign so the quota and phone guard are atomic.
 select * into c from public.nova_sample_campaigns where month=p_month for update;
 if not found then raise exception 'CAMPAIGN_CLOSED'; end if;
 select * into a from public.nova_sample_applications where request_key=p_request_key;
 if found then
  if a.campaign_month<>p_month or a.phone<>p_phone or a.customer_name<>p_name or a.address<>p_address or a.scent_codes<>p_codes then raise exception 'REQUEST_CONFLICT'; end if;
  return jsonb_build_object('id',a.id,'status',a.status,'duplicate',true);
 end if;
 if not c.enabled or p_month <> to_char(clock_timestamp() at time zone 'Asia/Yangon','YYYY-MM') then raise exception 'CAMPAIGN_CLOSED'; end if;
 if p_revision <> c.revision then raise exception 'CAMPAIGN_CHANGED'; end if;
 if coalesce(array_length(p_codes,1),0) <> (c.settings->>'selectionCount')::integer
   or (select count(distinct code) from unnest(p_codes) as codes(code)) <> array_length(p_codes,1)
   or exists(select 1 from unnest(p_codes) as codes(code) where not (c.settings->'codes' ? code))
   or p_request_key !~ '^[A-Za-z0-9_-]{8,128}$'
 then raise exception 'INVALID_SELECTION'; end if;
 if exists(select 1 from public.nova_sample_applications where campaign_month=p_month and phone=p_phone) then raise exception 'ALREADY_APPLIED'; end if;
 capacity := (c.settings->>'capacity')::integer;
 if capacity is not null and (select count(*) from public.nova_sample_applications where campaign_month=p_month) >= capacity then raise exception 'CAMPAIGN_FULL'; end if;
 insert into public.nova_sample_applications(id,campaign_month,campaign_revision,campaign_snapshot,customer_name,phone,address,scent_codes,request_key)
 values(p_id,p_month,c.revision,c.settings,trim(p_name),p_phone,trim(p_address),p_codes,p_request_key) returning * into a;
 return jsonb_build_object('id',a.id,'status',a.status,'duplicate',false);
end $$;

create or replace function public.update_nova_sample_status(p_id uuid,p_status text,p_actor text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.nova_sample_applications%rowtype;
begin
 if p_status not in ('pending','approved','declined','shipped') then raise exception 'INVALID_SELECTION'; end if;
 update public.nova_sample_applications set status=p_status,updated_by=p_actor,updated_at=clock_timestamp() where id=p_id returning * into a;
 if not found then raise exception 'INVALID_SELECTION'; end if;
 return jsonb_build_object('id',a.id,'status',a.status);
end $$;
revoke all on function public.save_nova_sample_campaign(text,integer,boolean,jsonb,text) from public,anon,authenticated;
revoke all on function public.create_nova_sample_application(uuid,text,integer,text,text,text,text[],text) from public,anon,authenticated;
revoke all on function public.update_nova_sample_status(uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_nova_sample_campaign(text,integer,boolean,jsonb,text) to service_role;
grant execute on function public.create_nova_sample_application(uuid,text,integer,text,text,text,text[],text) to service_role;
grant execute on function public.update_nova_sample_status(uuid,text,text) to service_role;
commit;
