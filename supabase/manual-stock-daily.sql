-- Additive manual bottle ledger. Apply to the isolated Preview database first.
-- Existing unsized inventory and its history are deliberately left untouched.
create table public.nova_stock_variants (
  product_id text not null check (product_id ~ '^NV-(00[1-9]|0[12][0-9]|03[0-2])$'),
  size text not null check (size in ('10ml','30ml')),
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key(product_id,size)
);
create table public.nova_stock_movements (
  id bigint generated always as identity primary key,
  request_id text not null unique check (length(request_id) between 8 and 128),
  product_id text not null,
  size text not null,
  delta integer not null check (delta <> 0 and abs(delta) <= 1000000),
  balance_before integer not null check (balance_before >= 0),
  balance_after integer not null check (balance_after >= 0 and balance_after = balance_before + delta),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  order_number text check (length(order_number) <= 100),
  actor_email text not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(product_id,size) references public.nova_stock_variants(product_id,size)
);
create index nova_stock_movements_variant_date on public.nova_stock_movements(product_id,size,created_at desc,id desc);
create index nova_stock_movements_day on public.nova_stock_movements(created_at,id);
alter table public.nova_stock_variants enable row level security;
alter table public.nova_stock_movements enable row level security;
revoke all on public.nova_stock_variants,public.nova_stock_movements from public,anon,authenticated;
grant select,insert,update on public.nova_stock_variants to service_role;
grant select,insert on public.nova_stock_movements to service_role;
grant usage,select on sequence public.nova_stock_movements_id_seq to service_role;

create function public.adjust_nova_stock(p_product_id text,p_size text,p_delta integer,p_reason text,p_order_number text,p_request_id text,p_actor_email text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
declare old_entry public.nova_stock_movements%rowtype; before_value integer; after_value integer; result public.nova_stock_movements%rowtype;
begin
  if p_product_id is null or p_product_id !~ '^NV-(00[1-9]|0[12][0-9]|03[0-2])$' or p_size is null or p_size not in ('10ml','30ml') then raise exception 'Invalid product or size'; end if;
  if p_delta is null or p_delta=0 or abs(p_delta::bigint)>1000000 or coalesce(length(btrim(p_reason)),0) not between 1 and 500 then raise exception 'Invalid stock amount or reason'; end if;
  if coalesce(length(p_request_id),0) not between 8 and 128 or coalesce(length(p_actor_email),0)=0 or length(coalesce(p_order_number,''))>100 then raise exception 'Invalid stock request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id,0));
  select * into old_entry from public.nova_stock_movements where request_id=p_request_id;
  if found then
    if old_entry.product_id<>p_product_id or old_entry.size<>p_size or old_entry.delta<>p_delta or old_entry.reason<>btrim(p_reason) or old_entry.actor_email<>p_actor_email or old_entry.order_number is distinct from nullif(btrim(p_order_number),'') then
      raise exception 'Stock request key already used for another change';
    end if;
    return jsonb_build_object('movement',to_jsonb(old_entry),'duplicate',true);
  end if;
  insert into public.nova_stock_variants(product_id,size) values(p_product_id,p_size) on conflict do nothing;
  select quantity into before_value from public.nova_stock_variants where product_id=p_product_id and size=p_size for update;
  after_value:=before_value+p_delta;
  if after_value<0 then raise exception 'Stock cannot become negative'; end if;
  update public.nova_stock_variants set quantity=after_value,updated_at=now() where product_id=p_product_id and size=p_size;
  insert into public.nova_stock_movements(request_id,product_id,size,delta,balance_before,balance_after,reason,order_number,actor_email)
    values(p_request_id,p_product_id,p_size,p_delta,before_value,after_value,btrim(p_reason),nullif(btrim(p_order_number),''),p_actor_email) returning * into result;
  return jsonb_build_object('movement',to_jsonb(result),'duplicate',false);
end; $$;

create function public.nova_stock_daily_report(p_day date)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare day_start timestamptz; day_end timestamptz; result jsonb;
begin
  if p_day is null or p_day < date '2000-01-01' or p_day > (now() at time zone 'Asia/Yangon')::date then raise exception 'Invalid report date'; end if;
  day_start:=p_day::timestamp at time zone 'Asia/Yangon';
  day_end:=(p_day+1)::timestamp at time zone 'Asia/Yangon';
  with balances as (
    select v.product_id,v.size,
      case when exists(select 1 from public.nova_stock_movements m where m.product_id=v.product_id and m.size=v.size and m.created_at<day_end)
        then coalesce((select m.balance_after from public.nova_stock_movements m where m.product_id=v.product_id and m.size=v.size and m.created_at<day_start order by m.created_at desc,m.id desc limit 1),0) else null end as opening,
      (select m.balance_after from public.nova_stock_movements m where m.product_id=v.product_id and m.size=v.size and m.created_at<day_end order by m.created_at desc,m.id desc limit 1) as closing,
      coalesce(sum(m.delta) filter(where m.delta>0),0) as stock_in,
      coalesce(-sum(m.delta) filter(where m.delta<0),0) as stock_out
    from public.nova_stock_variants v left join public.nova_stock_movements m on m.product_id=v.product_id and m.size=v.size and m.created_at>=day_start and m.created_at<day_end
    group by v.product_id,v.size
  ), day_orders as (
    select o.id,o.order_number,o.customer_name,o.status,o.total,o.created_at,
      coalesce((select jsonb_agg(jsonb_build_object('product_id',i.product_id,'product_name',i.product_name,'size',i.size,'quantity',i.quantity) order by i.id) from public.nova_order_items i where i.order_id=o.id),'[]'::jsonb) as items
    from public.nova_orders o where o.created_at>=day_start and o.created_at<day_end
  ) select jsonb_build_object(
    'date',p_day,'timezone','Asia/Yangon','generated_at',now(),
    'balances',coalesce((select jsonb_agg(to_jsonb(b) order by product_id,size) from balances b),'[]'::jsonb),
    'movements',coalesce((select jsonb_agg(to_jsonb(m) order by created_at desc,id desc) from public.nova_stock_movements m where created_at>=day_start and created_at<day_end),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(to_jsonb(o) order by created_at desc,id desc) from day_orders o),'[]'::jsonb),
    'order_count',(select count(*) from day_orders),
    'cancelled_count',(select count(*) from day_orders where status='cancelled'),
    'merchandise_total',coalesce((select sum(total) from day_orders where status<>'cancelled'),0)
  ) into result;
  return result;
end; $$;
revoke all on function public.adjust_nova_stock(text,text,integer,text,text,text,text) from public,anon,authenticated;
revoke all on function public.nova_stock_daily_report(date) from public,anon,authenticated;
grant execute on function public.adjust_nova_stock(text,text,integer,text,text,text,text),public.nova_stock_daily_report(date) to service_role;
notify pgrst,'reload schema';
