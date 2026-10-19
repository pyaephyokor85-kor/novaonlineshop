import test from 'node:test';
import assert from 'node:assert/strict';
import { processOrderNotification, validateOrder } from '../lib/order-notification.mjs';

const catalog = [{ id: 'NV-001', code: 'NV-001', name: 'Blue Essence', price: '15,000 Ks' }];
const env = { TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: 'test-chat' };
const request = body => ({ method: 'POST', body });

function response(ok = true, status = 200) {
  return { ok, status, json: async () => ({ ok }) };
}

test('rejects unknown products, fractional quantities, and out-of-range quantities', () => {
  const base = { customerName: 'A', phone: '09', address: 'Yangon', product: { id: 'NV-001' } };
  assert.throws(() => validateOrder({ ...base, product: { id: 'NV-999' } }, catalog), /Unknown NOVA product/);
  assert.throws(() => validateOrder({ ...base, quantity: 1.5 }, catalog), /whole number/);
  assert.throws(() => validateOrder({ ...base, quantity: 100 }, catalog), /between 1 and 99/);
});

test('uses catalog name and price rather than client-supplied values', async () => {
  let call;
  const result = await processOrderNotification(request({
    customerName: 'A', phone: '09', address: 'Yangon', quantity: 2,
    product: { id: 'NV-001', name: 'forged', price: '0 Ks' },
  }), { catalogProducts: catalog, env, fetchImpl: async (url, options) => {
    call = { url, options };
    return response();
  } });
  assert.equal(result.status, 200);
  const message = JSON.parse(call.options.body).text;
  assert.match(message, /Blue Essence/);
  assert.match(message, /15,000 Ks/);
  assert.doesNotMatch(message, /forged|Price: 0 Ks/);
});

test('does not call Telegram for invalid JSON or invalid order', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return response(); };
  const invalidJson = await processOrderNotification(request('{'), { catalogProducts: catalog, env, fetchImpl });
  const invalidProduct = await processOrderNotification(request({ customerName: 'A', phone: '09', address: 'Y', product: { id: 'bad' } }), { catalogProducts: catalog, env, fetchImpl });
  assert.equal(invalidJson.status, 400);
  assert.equal(invalidProduct.status, 400);
  assert.equal(calls, 0);
});
