import test from 'node:test';
import assert from 'node:assert/strict';
import { processAdminRequest } from '../lib/order-management.mjs';

const env = { NOVA_ORDER_STORAGE_ENABLED: 'true', SUPABASE_URL: 'https://preview.example.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', NOVA_ADMIN_EMAILS: 'owner@example.test' };
const headers = { authorization: 'Bearer staff-token' };
const reply = (data, ok = true) => ({ ok, json: async () => data });
function authOr(url) {
  if (url.endsWith('/auth/v1/user')) return reply({ id: 'staff-id', email: 'OWNER@example.test' });
  if (url.includes('/nova_inventory_adjustments?')) return reply([{ product_id: 'NV-001', delta: 5, metric: 'ml' }]);
  if (url.includes('/nova_inventory?')) return reply([{ product_id: 'NV-001', stock_units: 2, stock_ml: 5 }]);
  if (url.includes('/nova_discount_settings?')) return reply([{ enabled: false, percent: 0 }]);
  return reply({ product_id: 'NV-001', stock_units: 2, stock_ml: 5 });
}

test('authorized stock read includes balances and adjustment history', async () => {
  const result = await processAdminRequest({ method: 'GET', headers }, { resource: 'inventory', env, fetchImpl: async url => authOr(url) });
  assert.equal(result.status, 200); assert.equal(result.body.inventory[0].stock_units, 2); assert.equal(result.body.adjustments[0].delta, 5);
});

test('staff discount can be enabled and actor is derived from the authenticated session', async () => {
  let rpc;
  const result = await processAdminRequest({ method: 'POST', headers, body: { action: 'update', enabled: true, percent: 12.5, actorEmail: 'attacker@example.test' } }, { resource: 'discount', env, fetchImpl: async (url, options) => { if (url.endsWith('/rpc/update_nova_discount')) rpc = JSON.parse(options.body); return authOr(url); } });
  assert.equal(result.status, 200); assert.equal(rpc.p_enabled, true); assert.equal(rpc.p_percent, 12.5); assert.equal(rpc.p_actor_email, 'owner@example.test'); assert.equal('actorEmail' in rpc, false);
});

test('admin discount setting can be read and invalid percentages are rejected before RPC', async () => {
  let rpcCalls = 0;
  const fetchImpl = async (url, options) => { if (url.endsWith('/rpc/update_nova_discount')) rpcCalls += 1; return authOr(url); };
  const get = await processAdminRequest({ method: 'GET', headers }, { resource: 'discount', env, fetchImpl });
  const tooHigh = await processAdminRequest({ method: 'POST', headers, body: { action: 'update', enabled: true, percent: 100.1 } }, { resource: 'discount', env, fetchImpl });
  const tooPrecise = await processAdminRequest({ method: 'POST', headers, body: { action: 'update', enabled: true, percent: '1.234' } }, { resource: 'discount', env, fetchImpl });
  assert.equal(get.status, 200); assert.equal(get.body.setting.enabled, false); assert.equal(tooHigh.status, 400); assert.equal(tooPrecise.status, 400); assert.equal(rpcCalls, 0);
});

test('inventory adjustment uses signed values, requires reason, and uses verified actor identity', async () => {
  let rpc;
  const result = await processAdminRequest({ method: 'POST', headers, body: { action: 'adjust', productId: 'NV-001', metric: 'ml', delta: -2.5, reason: 'Preview test usage', actorEmail: 'attacker@example.test' } }, { resource: 'inventory', env, fetchImpl: async (url, options) => { if (url.endsWith('/rpc/adjust_nova_inventory')) rpc = JSON.parse(options.body); return authOr(url); } });
  const bad = await processAdminRequest({ method: 'POST', headers, body: { action: 'adjust', productId: 'NV-001', metric: 'ml', delta: '1.234', reason: 'Test' } }, { resource: 'inventory', env, fetchImpl: async (url, options) => { if (url.endsWith('/rpc/adjust_nova_inventory')) throw new Error('Should not call RPC'); return authOr(url); } });
  assert.equal(result.status, 200); assert.equal(rpc.p_delta, -2.5); assert.equal(rpc.p_reason, 'Preview test usage'); assert.equal(rpc.p_actor_email, 'owner@example.test'); assert.equal(bad.status, 400);
});
