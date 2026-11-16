import test from 'node:test';
import assert from 'node:assert/strict';
import { validReportDay, myanmarDay } from '../lib/manual-stock.mjs';
import { processAdminRequest } from '../lib/order-management.mjs';
const env = { NOVA_ORDER_STORAGE_ENABLED: 'true', SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'test-key', NOVA_ADMIN_EMAILS: 'owner@example.test' };
const headers = { authorization: 'Bearer test-token' };
const reply = (data, ok = true) => ({ ok, json: async () => data });
const change = { action: 'adjust_bottle', productId: 'NV-001', size: '10ml', delta: -2, reason: 'ရောင်းချ', orderNumber: 'NOVA-TEST', requestId: 'STOCK_test123' };
const run = (req, fetchImpl) => processAdminRequest(req, { resource: 'inventory', env, fetchImpl });
const auth = url => url.endsWith('/auth/v1/user');
test('Myanmar reporting switches day at 17:30 UTC and rejects impossible/future dates', () => {
  assert.equal(myanmarDay(new Date('2026-11-15T17:29:59Z')), '2026-11-15');
  assert.equal(myanmarDay(new Date('2026-11-15T17:30:00Z')), '2026-11-16');
  const now = new Date('2026-11-15T18:00:00Z');
  assert.equal(validReportDay('2026-11-16', now), true);
  for (const value of ['2026-02-30', '2026-11-17', '1999-01-01', '11/16/2026', '', ['2026-11-16']]) assert.equal(validReportDay(value, now), false);
});
test('anonymous and unauthorized stock/report requests never access private inventory', async () => {
  let calls = 0;
  assert.equal((await run({ method: 'GET', url: '/api/admin/inventory?view=daily&date=2026-11-16' }, async () => { calls++; })).status, 401);
  assert.equal(calls, 0);
  assert.equal((await run({ method: 'POST', headers, body: change }, async url => { calls++; assert.equal(auth(url), true); return reply({ id: 'other', email: 'other@example.test' }); })).status, 403);
  assert.equal(calls, 1);
});
test('bottle movement preserves size, signed amount and request key; actor comes from staff auth', async () => {
  let rpc;
  const result = await run({ method: 'POST', headers, body: { ...change, actorEmail: 'spoof@example.test' } }, async (url, options) => {
    if (auth(url)) return reply({ id: 'owner', email: 'OWNER@example.test' });
    assert.ok(url.endsWith('/rpc/adjust_nova_stock')); rpc = JSON.parse(options.body);
    return reply({ movement: { balance_after: 8 }, duplicate: false });
  });
  assert.equal(result.status, 200);
  assert.deepEqual(rpc, { p_product_id: 'NV-001', p_size: '10ml', p_delta: -2, p_reason: 'ရောင်းချ', p_order_number: 'NOVA-TEST', p_request_id: 'STOCK_test123', p_actor_email: 'owner@example.test' });
});
test('invalid bottle changes never call the mutation RPC', async () => {
  for (const invalid of [{ size: '50ml' }, { productId: 'NV-033' }, { delta: 0 }, { delta: 1.5 }, { delta: '2' }, { delta: 1000001 }, { reason: ' ' }, { requestId: 'x' }, { orderNumber: 2 }]) {
    const result = await run({ method: 'POST', headers, body: { ...change, ...invalid } }, async url => { assert.equal(auth(url), true); return reply({ id: 'owner', email: 'owner@example.test' }); });
    assert.equal(result.status, 400);
  }
});
test('oversell returns a conflict instead of a successful stock update', async () => {
  const result = await run({ method: 'POST', headers, body: change }, async url => auth(url) ? reply({ id: 'owner', email: 'owner@example.test' }) : reply({ message: 'Stock cannot become negative' }, false));
  assert.equal(result.status, 409);
});
test('daily report calls read-only aggregate RPC with the full day, not the 100-order queue', async () => {
  let count = 0;
  const result = await run({ method: 'GET', url: '/api/admin/inventory?view=daily&date=2026-01-01', headers }, async (url, options) => {
    if (auth(url)) return reply({ id: 'owner', email: 'owner@example.test' });
    count++; assert.ok(url.endsWith('/rpc/nova_stock_daily_report')); assert.deepEqual(JSON.parse(options.body), { p_day: '2026-01-01' });
    return reply({ orders: Array.from({ length: 101 }, (_, id) => ({ id })), movements: [] });
  });
  assert.equal(result.status, 200); assert.equal(result.body.report.orders.length, 101); assert.equal(count, 1);
});
