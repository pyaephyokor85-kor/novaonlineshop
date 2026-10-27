import test from 'node:test';
import assert from 'node:assert/strict';
import { processAdminRequest } from '../lib/order-management.mjs';
import { buildAddressLabelHtml, buildReceiptHtml } from '../lib/print-templates.mjs';

const env = { NOVA_ORDER_STORAGE_ENABLED: 'true', EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL: 'https://preview.example.test', NOVA_PREVIEW_SUPABASE_SERVICE_ROLE_KEY: 'fake-server-key', NOVA_ADMIN_EMAILS: 'staff@example.test' };
const item = { product_id: 'NV-001', product_name: 'Fake Preview Scent', size: '10ml', unit_price: 15000, quantity: 1, line_total: 15000 };
const fakeOrder = { id: '00000000-0000-4000-8000-000000000001', order_number: 'NOVA-FAKE-SHAPE-TEST', status: 'waiting', customer_name: 'FAKE PREVIEW CUSTOMER', phone: '00000000000', address: 'FAKE TEST ADDRESS — DO NOT DELIVER', payment_method: 'COD', subtotal: 15000, discount_percent: 10, discount_amount: 1500, total: 13500, created_at: '2026-10-27T00:00:00Z', nova_order_status_history: [{ to_status: 'waiting' }] };
const jsonResponse = data => ({ ok: true, json: async () => data });
const listOrders = orders => processAdminRequest({ method: 'GET', headers: { authorization: 'Bearer fake-staff-token' } }, { resource: 'orders', env, fetchImpl: async url => jsonResponse(url.endsWith('/auth/v1/user') ? { id: 'fake-staff', email: 'staff@example.test' } : orders) });

test('orders API normalizes the one-to-one item object for queue rendering and 80/110mm printing', async () => {
  // nova_order_items.order_id is UNIQUE, so PostgREST embeds a single object.
  const source = { ...fakeOrder, nova_order_items: item };
  const result = await listOrders([source]);
  assert.equal(result.status, 200);
  const order = result.body.orders[0];
  assert.deepEqual(order, { ...source, nova_order_items: [item] });
  assert.deepEqual(order.nova_order_items.map(row => row.product_name), ['Fake Preview Scent']);
  assert.equal(source.nova_order_items, item, 'normalization does not mutate the storage response');
  for (const width of [80, 110]) {
    const receipt = buildReceiptHtml(order, width);
    const label = buildAddressLabelHtml(order, width);
    assert.match(receipt, new RegExp(`size:${width}mm auto`));
    assert.match(label, new RegExp(`size:${width}mm 100mm`));
    assert.match(receipt, /Fake Preview Scent/);
    assert.match(receipt, /10ml/);
    assert.match(receipt, /13,500 Ks/);
    assert.match(receipt, /Discount \(10%\)/);
    assert.match(label, /FAKE TEST ADDRESS/);
  }
});

test('orders API preserves item arrays and normalizes absent relationships to empty arrays', async () => {
  const result = await listOrders([
    { ...fakeOrder, nova_order_items: [item] },
    { ...fakeOrder, nova_order_items: null },
    { ...fakeOrder },
  ]);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.orders.map(order => order.nova_order_items), [[item], [], []]);
  assert.deepEqual((await listOrders([])).body.orders, []);
});
