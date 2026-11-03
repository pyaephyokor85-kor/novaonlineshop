import test from 'node:test';
import assert from 'node:assert/strict';
import { processOrderNotification } from '../lib/order-notification.mjs';

const catalogProducts = [{ id: 'NV-001', name: 'Blue Essence' }];
const env = { NOVA_ORDER_STORAGE_ENABLED: 'true', SUPABASE_URL: 'https://preview.example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-server-key' };
const body = { idempotencyKey: 'preview-order-0001', customerName: 'Test Customer', phone: '09-000000', address: 'Fake Preview Address', quantity: 2, size: '30ml', paymentMethod: 'COD', discountPercent: 99, total: 1, product: { id: 'NV-001', name: 'Forged', price: '0 Ks' } };
const saved = { order_id: '00000000-0000-4000-8000-000000000001', order_number: 'NOVA-TEST-0001', status: 'waiting', subtotal: 70000, discount_percent: 10, discount_amount: 7000, total: 63000, size: '30ml', unit_price: 35000, duplicate: false };
const jsonResponse = (ok, value) => ({ ok, json: async () => value });

test('persists the server-priced, discounted COD snapshot even without Telegram credentials', async () => {
  let rpcBody;
  const result = await processOrderNotification({ method: 'POST', body }, { catalogProducts, env, fetchImpl: async (url, options) => { assert.match(url, /rpc\/create_nova_order$/); rpcBody = JSON.parse(options.body); return jsonResponse(true, saved); } });
  assert.equal(result.status, 201); assert.equal(result.body.orderNumber, saved.order_number); assert.equal(result.body.subtotal, 70000); assert.equal(result.body.discountPercent, 10); assert.equal(result.body.discountAmount, 7000); assert.equal(result.body.total, 63000); assert.equal(result.body.paymentMethod, 'COD'); assert.equal(result.body.deliveryFeeIncluded, false);
  assert.equal(rpcBody.p_size, '30ml'); assert.equal(rpcBody.p_quantity, 2); assert.equal(rpcBody.p_product_name, 'Blue Essence');
  assert.equal('p_unit_price' in rpcBody, false); assert.equal('p_total' in rpcBody, false); assert.equal('p_discount_percent' in rpcBody, false);
});

test('rejects a missing idempotency key before calling storage', async () => {
  let calls = 0;
  const result = await processOrderNotification({ method: 'POST', body: { ...body, idempotencyKey: undefined } }, { catalogProducts, env, fetchImpl: async () => { calls += 1; return jsonResponse(true, saved); } });
  assert.equal(result.status, 400); assert.equal(calls, 0);
});

test('saved order remains successful if Preview Telegram notification fails', async () => {
  let calls = 0;
  const result = await processOrderNotification({ method: 'POST', body }, { catalogProducts, env: { ...env, TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_ID: 'test' }, fetchImpl: async url => { calls += 1; if (url.includes('/rpc/create_nova_order')) return jsonResponse(true, saved); return jsonResponse(false, { ok: false }); } });
  assert.equal(calls, 2); assert.equal(result.status, 201); assert.equal(result.body.orderNumber, saved.order_number); assert.equal(result.body.notificationSent, false);
});

test('idempotent retry returns the stored totals without sending a duplicate Telegram alert', async () => {
  let calls = 0;
  const result = await processOrderNotification({ method: 'POST', body }, { catalogProducts, env: { ...env, TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_ID: 'test' }, fetchImpl: async () => { calls += 1; return jsonResponse(true, { ...saved, duplicate: true }); } });
  assert.equal(calls, 1); assert.equal(result.status, 201); assert.equal(result.body.duplicate, true); assert.equal(result.body.total, 63000);
});

test('disabled Preview storage preserves the existing Telegram-only order path and base subtotal', async () => {
  let message;
  const result = await processOrderNotification({ method: 'POST', body: { ...body, size: '10ml', quantity: 1 } }, { catalogProducts, env: { TELEGRAM_BOT_TOKEN: 'test', TELEGRAM_CHAT_ID: 'test' }, fetchImpl: async (_url, options) => { message = JSON.parse(options.body).text; return jsonResponse(true, { ok: true }); } });
  assert.equal(result.status, 200); assert.match(message, /Merchandise subtotal: 15,000 Ks/); assert.doesNotMatch(message, /Discount \(/);
});
