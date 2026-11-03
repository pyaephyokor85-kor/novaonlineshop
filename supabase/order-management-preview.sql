-- NOVA order administration, inventory, and global discount settings.
-- Apply ONLY to a newly created, isolated Preview Supabase project. Never run on Production.
create extension if not exists pgcrypto;

create table if not exists public.nova_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  idempotency_key text not null unique,
  status text not null default 'waiting' check (status in ('waiting','confirmed','packing','delivery','cancelled')),
  customer_name text not null,
  phone text not null,
  address text not null,
  payment_method text not null default 'COD' check (payment_method = 'COD'),
  subtotal bigint not null check (subtotal >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  discount_amount bigint not null default 0 check (discount_amount between 0 and subtotal),
  total bigint not null check (total = subtotal - discount_amount),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists nova_orders_status_created_idx on public.nova_orders(status, created_at desc);

create table if not exists public.nova_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.nova_orders(id) on delete cascade,
  product_id text not null check (product_id ~ '^NV-[0-9]{3}$'),
  product_name text not null,
  size text not null check (size in ('10ml','30ml')),
  unit_price integer not null check ((size='10ml' and unit_price=15000) or (size='30ml' and unit_price=35000)),
  quantity integer not null check (quantity between 1 and 99),
  line_total bigint not null check (line_total = unit_price * quantity)
);
create index if not exists nova_order_items_order_idx on public.nova_order_items(order_id);

create table if not exists public.nova_order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.nova_orders(id) on delete cascade,
  from_status text,
  to_status text not null check (to_status in ('waiting','confirmed','packing','delivery','cancelled')),
  actor_email text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists nova_order_status_history_order_idx on public.nova_order_status_history(order_id, created_at);

create table if not exists public.nova_inventory (
  product_id text primary key check (product_id ~ '^NV-[0-9]{3}$'),
  stock_units integer check (stock_units is null or stock_units >= 0),
  stock_ml numeric(12,2) check (stock_ml is null or stock_ml >= 0),
  updated_at timestamptz not null default now()
);
create table if not exists public.nova_inventory_adjustments (
  id bigint generated always as identity primary key,
  product_id text not null references public.nova_inventory(product_id) on delete cascade,
  metric text not null check (metric in ('units','ml')),
  delta numeric(12,2) not null check (delta <> 0),
  previous_value numeric(12,2),
  new_value numeric(12,2) not null check (new_value >= 0),
  reason text not null,
  actor_email text not null,
  created_at timestamptz not null default now()
);
create index if not exists nova_inventory_adjustments_product_date_idx on public.nova_inventory_adjustments(product_id, created_at desc);

create table if not exists public.nova_discount_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  percent numeric(5,2) not null default 0 check (percent between 0 and 100),
  updated_by text not null default 'system',
  updated_at timestamptz not null default now()
);
insert into public.nova_discount_settings(singleton, enabled, percent, updated_by)
  values (true, false, 0, 'system') on conflict (singleton) do nothing;

-- No public/anon/authenticated access. App-facing reads/writes go through server APIs.
alter table public.nova_orders enable row level security;
alter table public.nova_order_items enable row level security;
alter table public.nova_order_status_history enable row level security;
alter table public.nova_inventory enable row level security;
alter table public.nova_inventory_adjustments enable row level security;
alter table public.nova_discount_settings enable row level security;
revoke all on public.nova_orders, public.nova_order_items, public.nova_order_status_history, public.nova_inventory, public.nova_inventory_adjustments, public.nova_discount_settings from public, anon, authenticated;
grant select on public.nova_orders, public.nova_order_items, public.nova_order_status_history, public.nova_inventory, public.nova_inventory_adjustments, public.nova_discount_settings to service_role;

create or replace function public.create_nova_order(
  p_idempotency_key text, p_customer_name text, p_phone text, p_address text,
  p_product_id text, p_product_name text, p_size text, p_quantity integer
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  existing_order public.nova_orders%rowtype;
  existing_product_id text;
  existing_size text;
  existing_quantity integer;
  created_order public.nova_orders%rowtype;
  safe_key text := btrim(coalesce(p_idempotency_key,''));
  price integer;
  subtotal_value bigint;
  discount_rate numeric(5,2) := 0;
  discount_on boolean := false;
  discount_value bigint;
  total_value bigint;
begin
  if length(safe_key) < 8 or length(safe_key) > 128 or safe_key !~ '^[A-Za-z0-9_-]+$' then raise exception 'Invalid order request key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(safe_key, 0));
  if coalesce(length(btrim(p_customer_name)),0) not between 1 and 200 then raise exception 'Invalid customer name'; end if;
  if coalesce(length(btrim(p_phone)),0) not between 1 and 80 then raise exception 'Invalid phone'; end if;
  if coalesce(length(btrim(p_address)),0) not between 1 and 1000 then raise exception 'Invalid address'; end if;
  if p_product_id !~ '^NV-[0-9]{3}$' or coalesce(length(btrim(p_product_name)),0) not between 1 and 200 then raise exception 'Invalid product'; end if;
  if p_size = '10ml' then price := 15000;
  elsif p_size = '30ml' then price := 35000;
  else raise exception 'Size must be one of 10ml or 30ml'; end if;
  if p_quantity not between 1 and 99 then raise exception 'Invalid quantity'; end if;

  select * into existing_order from public.nova_orders where idempotency_key = safe_key;
  if found then
    select product_id, size, quantity into existing_product_id, existing_size, existing_quantity
      from public.nova_order_items where order_id = existing_order.id;
    if existing_order.customer_name <> btrim(p_customer_name) or existing_order.phone <> btrim(p_phone) or existing_order.address <> btrim(p_address)
      or existing_product_id <> p_product_id or existing_size <> p_size or existing_quantity <> p_quantity then
      raise exception 'Order request key was already used for a different order';
    end if;
    return jsonb_build_object('order_id', existing_order.id, 'order_number', existing_order.order_number, 'status', existing_order.status, 'created_at', existing_order.created_at, 'subtotal', existing_order.subtotal, 'discount_percent', existing_order.discount_percent, 'discount_amount', existing_order.discount_amount, 'total', existing_order.total, 'size', existing_size, 'unit_price', price, 'duplicate', true);
  end if;

  select enabled, percent into discount_on, discount_rate from public.nova_discount_settings where singleton = true;
  if not coalesce(discount_on, false) then discount_rate := 0; end if;
  subtotal_value := price::bigint * p_quantity;
  discount_value := round(subtotal_value * coalesce(discount_rate,0) / 100)::bigint;
  total_value := subtotal_value - discount_value;
  insert into public.nova_orders (idempotency_key, order_number, customer_name, phone, address, payment_method, subtotal, discount_percent, discount_amount, total)
    values (safe_key, 'NOVA-' || to_char(timezone('Asia/Yangon', now()), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)), btrim(p_customer_name), btrim(p_phone), btrim(p_address), 'COD', subtotal_value, coalesce(discount_rate,0), discount_value, total_value)
    returning * into created_order;
  insert into public.nova_order_items (order_id, product_id, product_name, size, unit_price, quantity, line_total)
    values (created_order.id, p_product_id, btrim(p_product_name), p_size, price, p_quantity, subtotal_value);
  insert into public.nova_order_status_history(order_id, from_status, to_status, actor_email, reason)
    values (created_order.id, null, 'waiting', 'customer-order', 'COD order received');
  return jsonb_build_object('order_id', created_order.id, 'order_number', created_order.order_number, 'status', created_order.status, 'created_at', created_order.created_at, 'subtotal', subtotal_value, 'discount_percent', coalesce(discount_rate,0), 'discount_amount', discount_value, 'total', total_value, 'size', p_size, 'unit_price', price, 'duplicate', false);
end;
$$;

create or replace function public.update_nova_order_status(
  p_order_id uuid, p_status text, p_actor_email text, p_reason text default null
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  order_row public.nova_orders%rowtype;
  previous_status text;
  allowed boolean := false;
begin
  select * into order_row from public.nova_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  previous_status := order_row.status;
  allowed := (order_row.status = 'waiting' and p_status in ('confirmed','cancelled'))
    or (order_row.status = 'confirmed' and p_status in ('packing','cancelled'))
    or (order_row.status = 'packing' and p_status in ('delivery','cancelled'));
  if not allowed then raise exception 'Order cannot move from % to %', order_row.status, p_status; end if;
  update public.nova_orders set status = p_status, updated_at = now() where id = p_order_id returning * into order_row;
  insert into public.nova_order_status_history(order_id, from_status, to_status, actor_email, reason)
    values (p_order_id, previous_status, p_status, left(coalesce(p_actor_email,'admin'),254), left(p_reason,500));
  return jsonb_build_object('id', order_row.id, 'order_number', order_row.order_number, 'status', order_row.status, 'updated_at', order_row.updated_at);
end;
$$;

create or replace function public.adjust_nova_inventory(
  p_product_id text, p_metric text, p_delta numeric, p_reason text, p_actor_email text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  inventory_row public.nova_inventory%rowtype;
  previous numeric(12,2);
  next_value numeric(12,2);
begin
  if p_product_id !~ '^NV-[0-9]{3}$' then raise exception 'Invalid product'; end if;
  if p_metric not in ('units','ml') or p_delta = 0 or abs(p_delta) > 1000000 then raise exception 'Invalid inventory adjustment'; end if;
  if p_metric='units' and p_delta <> trunc(p_delta) then raise exception 'Unit changes must be whole numbers'; end if;
  if p_metric='ml' and p_delta <> round(p_delta,2) then raise exception 'Milliliter changes allow at most two decimal places'; end if;
  if coalesce(length(btrim(p_reason)),0) not between 1 and 500 then raise exception 'Adjustment reason is required'; end if;
  insert into public.nova_inventory(product_id) values (p_product_id) on conflict (product_id) do nothing;
  select * into inventory_row from public.nova_inventory where product_id=p_product_id for update;
  previous := case when p_metric='units' then inventory_row.stock_units::numeric else inventory_row.stock_ml end;
  next_value := coalesce(previous,0) + p_delta;
  if next_value < 0 then raise exception 'Inventory cannot become negative'; end if;
  if p_metric='units' then update public.nova_inventory set stock_units=next_value::integer, updated_at=now() where product_id=p_product_id returning * into inventory_row;
  else update public.nova_inventory set stock_ml=next_value, updated_at=now() where product_id=p_product_id returning * into inventory_row; end if;
  insert into public.nova_inventory_adjustments(product_id,metric,delta,previous_value,new_value,reason,actor_email)
    values (p_product_id,p_metric,p_delta,previous,next_value,btrim(p_reason),left(coalesce(p_actor_email,'admin'),254));
  return jsonb_build_object('product_id',p_product_id,'stock_units',inventory_row.stock_units,'stock_ml',inventory_row.stock_ml,'updated_at',inventory_row.updated_at);
end;
$$;

create or replace function public.update_nova_discount(
  p_enabled boolean, p_percent numeric, p_actor_email text
) returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  setting public.nova_discount_settings%rowtype;
begin
  if p_enabled is null or p_percent is null or p_percent < 0 or p_percent > 100 or p_percent <> round(p_percent,2) then raise exception 'Discount must be enabled/disabled with a percentage from 0 to 100 (max 2 decimals)'; end if;
  insert into public.nova_discount_settings(singleton,enabled,percent,updated_by,updated_at)
    values (true,p_enabled,p_percent,left(coalesce(p_actor_email,'admin'),254),now())
    on conflict (singleton) do update set enabled=excluded.enabled, percent=excluded.percent, updated_by=excluded.updated_by, updated_at=now()
    returning * into setting;
  return jsonb_build_object('enabled',setting.enabled,'percent',setting.percent,'updated_by',setting.updated_by,'updated_at',setting.updated_at);
end;
$$;

revoke all on function public.create_nova_order(text,text,text,text,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.update_nova_order_status(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.adjust_nova_inventory(text,text,numeric,text,text) from public, anon, authenticated;
revoke all on function public.update_nova_discount(boolean,numeric,text) from public, anon, authenticated;
grant execute on function public.create_nova_order(text,text,text,text,text,text,text,integer) to service_role;
grant execute on function public.update_nova_order_status(uuid,text,text,text) to service_role;
grant execute on function public.adjust_nova_inventory(text,text,numeric,text,text) to service_role;
grant execute on function public.update_nova_discount(boolean,numeric,text) to service_role;
