import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIdempotencyKey, validateStatusTransition, processAdminRequest, processPublicDiscountRequest } from '../lib/order-management.mjs';
import { buildAddressLabelHtml, buildReceiptHtml } from '../lib/print-templates.mjs';

const env = { NOVA_ORDER_STORAGE_ENABLED: 'true', EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL: 'https://preview.example.test', NOVA_PREVIEW_SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key', SUPABASE_URL: 'https://production.example.test', SUPABASE_SERVICE_ROLE_KEY: 'production-server-key', NOVA_ADMIN_EMAILS: 'owner@example.test' };
const headers = { authorization: 'Bearer staff-token' };
const jsonResponse = (data, ok = true) => ({ ok, json: async () => data });

test('requires a safe idempotency key and only forward order-status transitions', () => {
  assert.throws(() => validateIdempotencyKey('x'), /request key/);
  assert.equal(validateIdempotencyKey('preview-order-0001'), 'preview-order-0001');
  assert.equal(validateStatusTransition('waiting', 'confirmed'), 'confirmed');
  assert.equal(validateStatusTransition('packing', 'cancelled'), 'cancelled');
  assert.throws(() => validateStatusTransition('delivery', 'cancelled'), /cannot move/);
  assert.throws(() => validateStatusTransition('waiting', 'delivery'), /cannot move/);
});

test('admin endpoints fail closed when Preview storage is disabled or credentials are missing', async () => {
  const disabled = await processAdminRequest({ method: 'GET', headers }, { resource: 'orders', env: { ...env, NOVA_ORDER_STORAGE_ENABLED: 'false' } });
  const missing = await processAdminRequest({ method: 'GET', headers }, { resource: 'orders', env: { NOVA_ORDER_STORAGE_ENABLED: 'true' } });
  assert.equal(disabled.status, 503); assert.equal(missing.status, 503);
});

test('admin storage prefers unique Preview URL and server-only key over legacy values', async () => {
  const requests = [];
  const result = await processAdminRequest({ method: 'GET', headers }, { resource: 'orders', env, fetchImpl: async (url, options) => { requests.push({ url, options }); return url.endsWith('/auth/v1/user') ? jsonResponse({ id: 'staff-id', email: 'owner@example.test' }) : jsonResponse([]); } });
  assert.equal(result.status, 200);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ url }) => url.startsWith('https://preview.example.test/')));
  assert.equal(requests[0].options.headers.apikey, 'server-only-test-key');
});

test('public discount endpoint safely defaults off without Preview configuration', async () => {
  const result = await processPublicDiscountRequest({ method: 'GET' }, { env: {} });
  assert.equal(result.status, 200); assert.deepEqual(result.body, { enabled: false, percent: 0 });
});

test('print templates use valid thermal dimensions at 80mm and 110mm and preserve COD contents', () => {
  const order = { id: 'id', order_number: 'NOVA-TEST', status: 'waiting', customer_name: '<script>', phone: '09', address: 'Yangon & Mandalay', created_at: '2026-10-24T00:00:00Z', subtotal: 70000, discount_percent: 10, discount_amount: 7000, total: 63000, payment_method: 'COD', nova_order_items: [{ product_id: 'NV-001', product_name: 'Blue Essence', size: '30ml', unit_price: 35000, quantity: 2, line_total: 70000 }] };
  const receipt = buildReceiptHtml(order, 110); const label = buildAddressLabelHtml(order, 80);
  assert.match(receipt, /@page\{size:110mm 110mm;margin:0\}/);
  assert.match(receipt, /pageSize\.textContent = '@page\{size:110mm ' \+ pageHeightMm \+ 'mm;margin:0\}'/);
  assert.match(label, /@page\{size:80mm 100mm;margin:0\}/);
  assert.match(receipt, /30ml/); assert.match(receipt, /Merchandise subtotal/); assert.match(receipt, /Discount \(10%\)/); assert.match(receipt, /−7,000 Ks/); assert.match(receipt, /63,000 Ks/); assert.match(receipt, /Delivery fee is not included/);
  assert.match(receipt, /&lt;script&gt;/); assert.match(label, /Yangon &amp; Mandalay/); assert.doesNotMatch(receipt, /<b>Customer:<\/b>\s*<script>/);

  for (const width of [80, 110]) {
    const widthReceipt = buildReceiptHtml(order, width);
    const widthLabel = buildAddressLabelHtml(order, width);
    assert.match(widthReceipt, new RegExp(`@page\\{size:${width}mm ${width}mm;margin:0\\}`));
    assert.match(widthReceipt, new RegExp(`pageSize\\.textContent = '@page\\{size:${width}mm '\\s*\\+ pageHeightMm`));
    assert.match(widthLabel, new RegExp(`@page\\{size:${width}mm 100mm;margin:0\\}`));
    assert.doesNotMatch(widthReceipt, /@page\{size:\d+mm auto;/);
    assert.doesNotMatch(widthLabel, /@page\{size:\d+mm auto;/);
  }
});
