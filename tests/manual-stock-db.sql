-- Run only on isolated Preview. Every fixture is rolled back.
begin;
set local role service_role;
do $$
declare entry jsonb; report jsonb; today date := (now() at time zone 'Asia/Yangon')::date; before_orders bigint; after_orders bigint; n integer;
begin
  select count(*) into before_orders from public.nova_orders;
  if exists(select 1 from public.nova_stock_variants where product_id='NV-032') then raise exception 'Fixture requires unused Preview NV-032'; end if;
  entry:=public.adjust_nova_stock('NV-032','10ml',20,'QA opening',null,'QA_STOCK_OPEN','qa@example.test');
  assert (entry->'movement'->>'balance_after')::integer=20;
  entry:=public.adjust_nova_stock('NV-032','10ml',-3,'QA sale','NOVA-QA','QA_STOCK_OUT','qa@example.test');
  assert (entry->'movement'->>'balance_after')::integer=17;
  entry:=public.adjust_nova_stock('NV-032','10ml',-3,'QA sale','NOVA-QA','QA_STOCK_OUT','qa@example.test');
  assert (entry->>'duplicate')::boolean;
  select count(*) into n from public.nova_stock_movements where product_id='NV-032'; assert n=2;
  begin
    perform public.adjust_nova_stock('NV-032','10ml',-18,'QA oversell',null,'QA_STOCK_NEG','qa@example.test');
    raise exception 'oversell should fail';
  exception when others then if sqlerrm not like '%cannot become negative%' then raise; end if; end;
  begin
    perform public.adjust_nova_stock('NV-032','10ml',-2,'QA sale','NOVA-QA','QA_STOCK_OUT','qa@example.test');
    raise exception 'key mismatch should fail';
  exception when others then if sqlerrm not like '%already used%' then raise; end if; end;
  perform public.adjust_nova_stock('NV-032','30ml',8,'QA opening',null,'QA_STOCK_30ML','qa@example.test');
  report:=public.nova_stock_daily_report(today);
  assert (select (x->>'closing')::integer from jsonb_array_elements(report->'balances') x where x->>'product_id'='NV-032' and x->>'size'='10ml')=17;
  assert (select (x->>'stock_in')::integer from jsonb_array_elements(report->'balances') x where x->>'product_id'='NV-032' and x->>'size'='10ml')=20;
  assert (select (x->>'stock_out')::integer from jsonb_array_elements(report->'balances') x where x->>'product_id'='NV-032' and x->>'size'='10ml')=3;
  assert (select (x->>'closing')::integer from jsonb_array_elements(report->'balances') x where x->>'product_id'='NV-032' and x->>'size'='30ml')=8;
  select count(*) into after_orders from public.nova_orders; assert before_orders=after_orders;
end $$;
-- Verify midnight boundaries: start inclusive, next midnight exclusive.
do $$
declare d date:=(now() at time zone 'Asia/Yangon')::date-1; a timestamptz; b timestamptz; r jsonb;
begin
  a:=d::timestamp at time zone 'Asia/Yangon'; b:=(d+1)::timestamp at time zone 'Asia/Yangon';
  insert into public.nova_stock_variants(product_id,size,quantity) values('NV-031','10ml',17);
  insert into public.nova_stock_movements(request_id,product_id,size,delta,balance_before,balance_after,reason,actor_email,created_at) values
    ('QA_BOUNDARY_BEFORE','NV-031','10ml',10,0,10,'QA','qa@example.test',a-interval '1 second'),
    ('QA_BOUNDARY_START','NV-031','10ml',3,10,13,'QA','qa@example.test',a),
    ('QA_BOUNDARY_LAST','NV-031','10ml',-1,13,12,'QA','qa@example.test',b-interval '1 second'),
    ('QA_BOUNDARY_NEXT','NV-031','10ml',5,12,17,'QA','qa@example.test',b);
  r:=public.nova_stock_daily_report(d);
  assert (select (x->>'opening')::int from jsonb_array_elements(r->'balances') x where x->>'product_id'='NV-031')=10;
  assert (select (x->>'closing')::int from jsonb_array_elements(r->'balances') x where x->>'product_id'='NV-031')=12;
  assert (select count(*) from jsonb_array_elements(r->'movements') x where x->>'product_id'='NV-031')=2;
end $$;
rollback;
