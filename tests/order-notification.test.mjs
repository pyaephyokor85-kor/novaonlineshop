import test from 'node:test';
import assert from 'node:assert/strict';
import { processOrderNotification, validateOrder } from '../lib/order-notification.mjs';

const catalog = [{ id: 'NV-001', code: 'NV-001', name: 'Blue Essence', price: 'client price is not trusted' }];
const env = { TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: 'test-chat' };
const request = body => ({ method: 'POST', body });
const response = (ok = true) => ({ ok, status: ok ? 200 : 502, json: async () => ({ ok }) });
const base = { customerName: 'A', phone: '09', address: 'Yangon', quantity: 1, paymentMethod: 'COD', product: { id: 'NV-001' } };

test('server uses the fixed 10ml and 30ml prices and COD policy', () => {
  const ten = validateOrder({ ...base, size: '10ml', product: { id: 'NV-001', price: '0 Ks' } }, catalog);
  const thirty = validateOrder({ ...base, size: '30ml', quantity: 2 }, catalog);
  assert.equal(ten.unitPrice, 15000); assert.equal(ten.total, 15000); assert.equal(ten.paymentMethod, 'COD');
  assert.equal(thirty.unitPrice, 35000); assert.equal(thirty.total, 70000);
  assert.throws(() => validateOrder({ ...base, size: '15ml' }, catalog), /Size must/);
  assert.throws(() => validateOrder({ ...base, size: '10ml', paymentMethod: 'CARD' }, catalog), /COD/);
});

test('rejects unknown products, fractional quantities, and out-of-range quantities', () => {
  assert.throws(() => validateOrder({ ...base, size: '10ml', product: { id: 'NV-999' } }, catalog), /Unknown NOVA product/);
  assert.throws(() => validateOrder({ ...base, size: '10ml', quantity: 1.5 }, catalog), /whole number/);
  assert.throws(() => validateOrder({ ...base, size: '10ml', quantity: 100 }, catalog), /between 1 and 99/);
});

test('Telegram notification uses server catalog and 10ml pricing, not client values', async () => {
  let call;
  const result = await processOrderNotification(request({ ...base, size: '10ml', quantity: 2, product: { id: 'NV-001', name: 'forged', price: '0 Ks' }, discountPercent: 90, total: 1 }), { catalogProducts: catalog, env, fetchImpl: async (url, options) => { call = { url, options }; return response(); } });
  assert.equal(result.status, 200);
  const message = JSON.parse(call.options.body).text;
  assert.match(message, /Blue Essence/); assert.match(message, /Unit price: 15,000 Ks/); assert.match(message, /Merchandise subtotal: 30,000 Ks/);
  assert.match(message, /Payment: COD/); assert.match(message, /not included/);
  assert.doesNotMatch(message, /forged|Price: 0 Ks|discountPercent/);
});

test('invalid JSON, product, and payment never notify Telegram', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response(); };
  const invalidJson = await processOrderNotification(request('{'), { catalogProducts: catalog, env, fetchImpl });
  const invalidProduct = await processOrderNotification(request({ ...base, size: '10ml', product: { id: 'bad' } }), { catalogProducts: catalog, env, fetchImpl });
  const invalidPayment = await processOrderNotification(request({ ...base, size: '10ml', paymentMethod: 'CARD' }), { catalogProducts: catalog, env, fetchImpl });
  assert.equal(invalidJson.status, 400); assert.equal(invalidProduct.status, 400); assert.equal(invalidPayment.status, 400); assert.equal(calls, 0);
});
