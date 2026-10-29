import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { processThermerTicketRequest, processThermerResponseRequest, THERMER_TICKET_SECONDS, THERMER_RESPONSE_HEADERS } from '../lib/thermer-print.mjs';
import { buildThermerReceiptData } from '../lib/print-templates.mjs';
import ticketHandler from '../api/admin/print-ticket.mjs';
import responseHandler from '../api/print-response.mjs';
import { previewFakeReceipt } from './fixtures/preview-fake-receipt.mjs';

const orderId = '00000000-0000-4000-8000-000000000001'; // Synthetic test ID, not the live order UUID.
const nowMs = Date.parse('2026-10-29T06:00:00Z');
const env = {
  VERCEL_ENV: 'preview', NOVA_ORDER_STORAGE_ENABLED: 'true', NOVA_THERMER_PRINT_ENABLED: 'true',
  EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL: 'https://preview.example.test', NOVA_PREVIEW_SUPABASE_SERVICE_ROLE_KEY: 'preview-service-key',
  NOVA_PRINT_TOKEN_SECRET: 'a-dedicated-test-secret-at-least-32-characters', NOVA_ADMIN_EMAILS: ' Owner@Example.Test ',
  NOVA_THERMER_RELAY_URL: 'https://nova-test-relay.vercel.app/api/receipt',
  SUPABASE_URL: 'https://production.example.test', SUPABASE_SERVICE_ROLE_KEY: 'must-not-use-production',
  EXPO_PUBLIC_SUPABASE_URL: 'https://production.example.test',
};
const headers = { authorization: 'Bearer staff-token' };
const order = { ...previewFakeReceipt, id: orderId, address: 'DO NOT INCLUDE THIS ADDRESS', idempotency_key: 'DO-NOT-INCLUDE', nova_order_status_history: [{ actor_email: 'DO-NOT-INCLUDE' }] };
const reply = (data, ok = true) => ({ ok, json: async () => data });
function mockReads({ user = { id: 'staff-id', email: 'owner@example.test' }, authOk = true, missing = false, returnedOrder = order } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    assert.equal(options.method || 'GET', 'GET', 'printer flow must never write orders or storage');
    assert.ok(url.startsWith('https://preview.example.test/'), 'must never use legacy Production configuration');
    if (url.endsWith('/auth/v1/user')) return reply(user, authOk);
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/rest/v1/nova_orders');
    assert.equal(parsed.searchParams.get('id'), `eq.${orderId}`);
    assert.equal(parsed.searchParams.get('limit'), '1');
    return reply(missing ? [] : [parsed.searchParams.get('select') === 'id' ? { id: returnedOrder.id } : returnedOrder]);
  };
  return { calls, fetchImpl };
}
const prepare = (deps = {}) => processThermerTicketRequest({ method: 'POST', headers, body: { orderId } }, { env, nowMs, ...deps });
const read = (token, deps = {}) => processThermerResponseRequest({ method: 'GET', url: `/api/print-response?token=${encodeURIComponent(token)}` }, { env, nowMs, ...deps });
function resign(token, changes) {
  const claims = { ...JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')), ...changes };
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  return `${payload}.${createHmac('sha256', env.NOVA_PRINT_TOKEN_SECRET).update(payload).digest('base64url')}`;
}

test('Thermer is disabled by default, hard-blocked in Production, and never uses legacy credentials', async () => {
  const variants = [
    { NOVA_THERMER_PRINT_ENABLED: 'false' }, { NOVA_ORDER_STORAGE_ENABLED: 'false' }, { VERCEL_ENV: 'production' },
    { EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL: '' }, { NOVA_PREVIEW_SUPABASE_SERVICE_ROLE_KEY: '' },
    { NOVA_PRINT_TOKEN_SECRET: '' }, { NOVA_PRINT_TOKEN_SECRET: 'x'.repeat(31) },
    { EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL: 'http://preview.example.test' },
    { EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL: 'https://user:password@preview.example.test' },
    { EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL: 'https://preview.example.test/path' },
    { EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL: 'https://preview.example.test/?secret=value' },
    { EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL: 'https://preview.example.test/#fragment' },
  ];
  for (const variant of variants) {
    let calls = 0;
    const deps = { env: { ...env, ...variant }, fetchImpl: async () => { calls += 1; throw new Error('must not fetch'); } };
    assert.equal((await prepare(deps)).status, 503);
    assert.equal((await read('invalid', deps)).status, 503);
    assert.equal(calls, 0);
  }
  assert.equal((await prepare({ env: { ...env, NOVA_PRINT_TOKEN_SECRET: 'x'.repeat(32) }, fetchImpl: mockReads().fetchImpl })).status, 200);
});

test('prepare is POST-only, response is GET-only, and staff Bearer plus normalized allowlist is required', async () => {
  assert.equal((await processThermerTicketRequest({ method: 'GET' }, { env })).status, 405);
  assert.equal((await processThermerResponseRequest({ method: 'POST' }, { env })).status, 405);
  for (const authorization of ['', 'Basic staff-token', 'Bearer ']) {
    const mock = mockReads();
    assert.equal((await processThermerTicketRequest({ method: 'POST', headers: { authorization }, body: { orderId } }, { env, fetchImpl: mock.fetchImpl })).status, 401);
    assert.equal(mock.calls.length, 0);
  }
  for (const user of [{ id: 'staff-id' }, { id: 'staff-id', email: 'other@example.test' }]) {
    const mock = mockReads({ user });
    const result = await prepare({ fetchImpl: mock.fetchImpl });
    assert.equal(result.status, user.email ? 403 : 401);
    assert.equal(mock.calls.length, 1);
  }
  assert.equal((await prepare({ fetchImpl: mockReads({ authOk: false }).fetchImpl })).status, 401);
  assert.equal((await prepare({ fetchImpl: async () => { throw new Error('network failure'); } })).status, 502);
  assert.equal((await prepare({ fetchImpl: mockReads({ user: { id: 'staff-id', email: 'OWNER@EXAMPLE.TEST' } }).fetchImpl })).status, 200);
});

test('prepare validates JSON/order IDs and checks exactly one existing order without writes', async () => {
  for (const body of ['{', [], {}, { orderId: 'not-a-uuid' }, { orderId: `${orderId}&select=*` }]) {
    const mock = mockReads();
    const result = await processThermerTicketRequest({ method: 'POST', headers, body }, { env, fetchImpl: mock.fetchImpl });
    assert.equal(result.status, 400); assert.equal(mock.calls.length, 1);
  }
  assert.equal((await prepare({ fetchImpl: mockReads({ missing: true }).fetchImpl })).status, 404);
  assert.equal((await prepare({ fetchImpl: mockReads({ returnedOrder: { ...order, id: '00000000-0000-4000-8000-000000000002' } }).fetchImpl })).status, 404);
  const mock = mockReads(); const result = await prepare({ fetchImpl: mock.fetchImpl });
  assert.equal(result.status, 200); assert.equal(result.body.paperWidth, 80);
  assert.equal(Date.parse(result.body.expiresAt) - nowMs, THERMER_TICKET_SECONDS * 1000);
  const claims = JSON.parse(Buffer.from(result.body.token.split('.')[0], 'base64url').toString('utf8'));
  assert.equal(claims.orderId, orderId); assert.equal(claims.exp - claims.iat, 120);
  assert.ok(!JSON.stringify(claims).includes(order.customer_name)); assert.ok(!JSON.stringify(claims).includes(order.phone));
  assert.equal(mock.calls.length, 2);
});

test('ticket handoff requires a dedicated HTTPS relay and blocks every order except the existing fake QA receipt', async () => {
  for (const relay of ['', 'http://relay.vercel.app/api/receipt', 'https://relay.vercel.app/api/receipt?token=bad', 'https://relay.vercel.app/api/print-response', 'https://user:pass@relay.vercel.app/api/receipt']) {
    const mock = mockReads();
    assert.equal((await prepare({ env: { ...env, NOVA_THERMER_RELAY_URL: relay }, fetchImpl: mock.fetchImpl })).status, 503);
    assert.equal(mock.calls.length, 0);
  }
  for (const changed of [{ order_number: 'NOVA-OTHER' }, { customer_name: 'Real Customer' }]) {
    assert.equal((await prepare({ fetchImpl: mockReads({ returnedOrder: { ...order, ...changed } }).fetchImpl })).status, 403);
  }
  const issued = await prepare({ fetchImpl: mockReads().fetchImpl });
  const url = new URL(issued.body.responseUrl);
  assert.equal(url.origin, 'https://nova-test-relay.vercel.app');
  assert.equal(url.pathname, '/api/receipt');
  assert.equal(url.searchParams.get('token'), issued.body.token);
  assert.equal((await read(issued.body.token, { fetchImpl: mockReads({ returnedOrder: { ...order, customer_name: 'Real Customer' } }).fetchImpl })).status, 403);
});

test('response rejects missing, duplicate, malformed, tampered, wrong-purpose, future, and expired tickets before any database read', async () => {
  const issued = await prepare({ fetchImpl: mockReads().fetchImpl }); const token = issued.body.token;
  const candidates = ['invalid', `${token}x`, `${token.split('.')[0]}.AA`, resign(token, { purpose: 'another-purpose' }), resign(token, { orderId: 'not-a-uuid' }), resign(token, { iat: Math.floor(nowMs / 1000) + 31, exp: Math.floor(nowMs / 1000) + 151 }), resign(token, { exp: Math.floor(nowMs / 1000) + 121 })];
  for (const candidate of candidates) {
    const mock = mockReads();
    assert.equal((await read(candidate, { fetchImpl: mock.fetchImpl })).status, 401); assert.equal(mock.calls.length, 0);
  }
  for (const url of ['/api/print-response', `/api/print-response?token=${token}&token=${token}`]) {
    const mock = mockReads();
    assert.equal((await processThermerResponseRequest({ method: 'GET', url }, { env, nowMs, fetchImpl: mock.fetchImpl })).status, 401); assert.equal(mock.calls.length, 0);
  }
  const mock = mockReads();
  assert.equal((await read(token, { nowMs: nowMs + 120000, fetchImpl: mock.fetchImpl })).status, 401); assert.equal(mock.calls.length, 0);
  const wrongSecret = { ...env, NOVA_PRINT_TOKEN_SECRET: 'another-dedicated-test-secret-over-32-characters' };
  assert.equal((await read(token, { env: wrongSecret, fetchImpl: mock.fetchImpl })).status, 401);
});

test('valid ticket reads only receipt fields for one order and preserves the existing fake Preview financial snapshot', async () => {
  const ticket = await prepare({ fetchImpl: mockReads().fetchImpl }); const mock = mockReads();
  const result = await read(ticket.body.token, { fetchImpl: mock.fetchImpl });
  assert.equal(result.status, 200); assert.equal(mock.calls.length, 1);
  const select = new URL(mock.calls[0].url).searchParams.get('select');
  assert.ok(!select.includes('*')); assert.ok(!/address|history|idempotency|inventory/.test(select)); assert.ok(select.includes('unit_price'));
  const contents = Object.values(result.body).map(entry => entry.content).join('\n');
  assert.match(contents, /NOVA-261027-9F8B1A/); assert.match(contents, /NV-001 \/ 10ml x 1/);
  assert.match(contents, /Unit: 15,000 Ks/); assert.match(contents, /Merchandise subtotal: 15,000 Ks/);
  assert.match(contents, /Discount \(10%\): -1,500 Ks/); assert.match(contents, /COD total: 13,500 Ks/); assert.match(contents, /Delivery fee NOT included/);
  assert.doesNotMatch(contents, /DO NOT INCLUDE|DO-NOT-INCLUDE/);
  assert.equal((await read(ticket.body.token, { fetchImpl: mockReads().fetchImpl })).status, 200, 'tickets are intentionally reusable only until expiry; no one-time claim');
  assert.equal((await read(ticket.body.token, { fetchImpl: mockReads({ missing: true }).fetchImpl })).status, 404);
});

test('Thermer JSON mirrors numeric-keyed PHP output, uses only text entries, preserves Myanmar, and neutralizes markup and printer controls', () => {
  const data = buildThermerReceiptData({ ...order, customer_name: 'မြန်မာ <br />\u001b@\u202e', nova_order_items: [{ ...order.nova_order_items[0], product_name: '<script>Blue & Fresh</script>' }] });
  assert.equal(Array.isArray(data), false); assert.deepEqual(Object.keys(data), Object.keys(data).map((_, index) => String(index)));
  for (const entry of Object.values(data)) {
    assert.equal(entry.type, 0); assert.equal(typeof entry.content, 'string'); assert.ok(entry.content.length > 0);
    assert.ok([0, 1].includes(entry.bold)); assert.ok([0, 1, 2].includes(entry.align)); assert.ok([0, 1, 2, 3, 4].includes(entry.format));
    assert.doesNotMatch(entry.content, /[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/);
  }
  const serialized = JSON.stringify(data);
  assert.match(serialized, /မြန်မာ/); assert.match(serialized, /\[br \/\]/); assert.match(serialized, /\[script\]/);
  assert.equal(JSON.parse(Buffer.from(serialized, 'utf8').toString('utf8'))['0'].content, 'NOVA');
});

test('invalid financial or item snapshots fail instead of printing recomputed or incomplete totals', () => {
  for (const changed of [{ total: 1 }, { subtotal: -1 }, { discount_percent: 101 }, { payment_method: 'card' }, { nova_order_items: [] }, { nova_order_items: [{ ...order.nova_order_items[0], line_total: 1 }] }, { nova_order_items: [{ ...order.nova_order_items[0], unit_price: null, line_total: 0 }], subtotal: 0, total: 0, discount_amount: 0 }]) {
    assert.throws(() => buildThermerReceiptData({ ...order, ...changed }));
  }
});

test('Vercel route wrappers apply UTF-8/no-store/nosniff/no-referrer headers and never add CORS, including errors', async () => {
  const previous = process.env.NOVA_THERMER_PRINT_ENABLED; process.env.NOVA_THERMER_PRINT_ENABLED = 'false';
  try {
    for (const [handler, req, expected] of [[ticketHandler, { method: 'POST', headers, body: { orderId } }, 503], [responseHandler, { method: 'GET', url: '/api/print-response?token=bad' }, 503], [ticketHandler, { method: 'GET' }, 405], [responseHandler, { method: 'OPTIONS' }, 405]]) {
      const response = { headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
      await handler(req, response);
      assert.equal(response.statusCode, expected);
      for (const [name, value] of Object.entries(THERMER_RESPONSE_HEADERS)) assert.equal(response.headers[name.toLowerCase()], value);
      assert.ok(!Object.keys(response.headers).some(name => name.startsWith('access-control-')));
      assert.ok(response.body.error);
    }
  } finally { if (previous === undefined) delete process.env.NOVA_THERMER_PRINT_ENABLED; else process.env.NOVA_THERMER_PRINT_ENABLED = previous; }
});
