import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIdempotencyKey, validateStatusTransition, processAdminRequest, processPublicDiscountRequest } from '../lib/order-management.mjs';
import { buildAddressLabelHtml, buildReceiptHtml } from '../lib/print-templates.mjs';

const env = { NOVA_ORDER_STORAGE_ENABLED: 'true', SUPABASE_URL: 'https://preview.example.test', SUPABASE_SERVICE_ROLE_KEY: 'server-only-test-key', NOVA_ADMIN_EMAILS: 'owner@example.test' };
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

test('public discount endpoint safely defaults off without Preview configuration', async () => {
  const result = await processPublicDiscountRequest({ method: 'GET' }, { env: {} });
  assert.equal(result.status, 200); assert.deepEqual(result.body, { enabled: false, percent: 0 });
});

test('print receipt renders immutable subtotal, discount and COD total at 110mm; label uses 80mm and escapes input', () => {
  const order = { id: 'id', order_number: 'NOVA-TEST', status: 'waiting', customer_name: '<script>', phone: '09', address: 'Yangon & Mandalay', created_at: '2026-10-24T00:00:00Z', subtotal: 70000, discount_percent: 10, discount_amount: 7000, total: 63000, payment_method: 'COD', nova_order_items: [{ product_id: 'NV-001', product_name: 'Blue Essence', size: '30ml', unit_price: 35000, quantity: 2, line_total: 70000 }] };
  const receipt = buildReceiptHtml(order, 110); const label = buildAddressLabelHtml(order, 80);
  assert.match(receipt, /size:110mm auto/); assert.match(label, /size:80mm 100mm/);
  assert.match(receipt, /30ml/); assert.match(receipt, /Merchandise subtotal/); assert.match(receipt, /Discount \(10%\)/); assert.match(receipt, /−7,000 Ks/); assert.match(receipt, /63,000 Ks/); assert.match(receipt, /Delivery fee is not included/);
  assert.match(receipt, /&lt;script&gt;/); assert.match(label, /Yangon &amp; Mandalay/); assert.doesNotMatch(receipt, /<b>Customer:<\/b>\s*<script>/);
});
