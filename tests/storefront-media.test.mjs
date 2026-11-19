import test from 'node:test';
import assert from 'node:assert/strict';
import { processMedia, publicMedia } from '../lib/storefront-media.mjs';
import { processAdminRequest } from '../lib/order-management.mjs';
const baseUrl = 'https://preview.example.test';
const photo = `${baseUrl}/storage/v1/object/public/nova-storefront-media/NV-001/photo.jpg`;
const env = { NOVA_ORDER_STORAGE_ENABLED: 'true', EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL: baseUrl, NOVA_PREVIEW_SUPABASE_SERVICE_ROLE_KEY: 'test-only', NOVA_ADMIN_EMAILS: 'owner@example.test' };
const response = data => ({ ok: true, json: async () => data });
function storage(initial = []) {
  const rows = new Map(initial.map(row => [row.id, { ...row }]));
  const writes = [];
  const fetchImpl = async (url, options = {}) => {
    if (options.method !== 'POST') return response([...rows.values()]);
    const patch = JSON.parse(options.body); writes.push(patch);
    const saved = { title: '', description: '', enabled: true, deleted: false, image_url: null, cta: 'discover', sort_order: 0, ...rows.get(patch.id), ...patch };
    rows.set(saved.id, saved); return response([saved]);
  };
  const post = body => processMedia({ method: 'POST', body }, { baseUrl, serviceKey: 'test-only', email: 'owner@example.test', fetchImpl });
  const read = () => publicMedia({ env, fetchImpl });
  return { rows, writes, post, read, fetchImpl };
}
test('scent add/edit/delete round trips Burmese and blank without changing an existing photo', async () => {
  const db = storage([{ id: 'NV-001', kind: 'product', image_url: photo, enabled: true, deleted: false }]);
  for (const text of ['လတ်ဆတ်သော ရနံ့\nနေ့စဉ်အတွက်', 'ပြင်ဆင်ထားသော ရနံ့', '']) {
    const saved = await db.post({ action: 'scent', id: 'NV-001', scent_description: text });
    assert.equal(saved.status, 200); assert.equal(saved.body.media.scent_description, text);
    const row = (await db.read()).body.media[0];
    assert.equal(row.scent_description, text); assert.equal(row.image_url, photo);
    assert.equal(row.enabled, true); assert.equal(row.deleted, false);
    assert.equal(Object.hasOwn(db.writes.at(-1), 'image_url'), false);
  }
});
test('text-only products retain default imagery while old photo rows retain catalog copy', async () => {
  const db = storage([{ id: 'NV-002', kind: 'product', description: '', image_url: photo, enabled: true, deleted: false }]);
  await db.post({ action: 'scent', id: 'NV-001', scent_description: 'အသစ်' });
  const rows = (await db.read()).body.media;
  assert.equal(rows.find(r => r.id === 'NV-001').image_url, null);
  assert.equal(rows.find(r => r.id === 'NV-001').deleted, false);
  assert.equal(rows.find(r => r.id === 'NV-002').scent_description, null);
});
test('photo replacement, visibility, and deletion cannot overwrite scent copy from a stale draft', async () => {
  const db = storage();
  await db.post({ action: 'scent', id: 'NV-001', scent_description: 'Keep this description' });
  for (const body of [
    { action: 'save', id: 'NV-001', image_url: photo, enabled: true, cta: 'discover', description: 'stale draft' },
    { action: 'save', id: 'NV-001', image_url: photo, enabled: false, cta: 'discover', description: '' },
    { action: 'delete', id: 'NV-001' }
  ]) {
    const result = await db.post(body);
    assert.equal(result.status, 200); assert.equal(result.body.media.scent_description, 'Keep this description');
    assert.equal(Object.hasOwn(db.writes.at(-1), 'description'), false);
  }
  const row = (await db.read()).body.media[0];
  assert.equal(row.deleted, true); assert.equal(row.image_url, null);
  assert.equal(row.scent_description, 'Keep this description');
});
test('scent updates reject slide IDs, nontext and overlength input before storage writes', async () => {
  const db = storage();
  for (const body of [
    { id: 'slide-123', scent_description: 'wrong kind' }, { id: 'NV-033', scent_description: 'invalid code' },
    { id: 'NV-001', scent_description: null }, { id: 'NV-001', scent_description: 'x'.repeat(4001) }
  ]) assert.equal((await db.post({ action: 'scent', ...body })).status, 400);
  assert.equal(db.writes.length, 0);
});
test('the public feed keeps slide text plain and excludes hidden/deleted board images', async () => {
  const db = storage([
    { id: 'slide-public', kind: 'slide', title: 'Coming Soon', description: 'New scents', image_url: photo, enabled: true, deleted: false },
    { id: 'slide-hidden', kind: 'slide', enabled: false, deleted: false },
    { id: 'slide-deleted', kind: 'slide', enabled: true, deleted: true },
  ]);
  const rows = (await db.read()).body.media;
  assert.equal(rows.length, 1); assert.equal(rows[0].description, 'New scents');
  assert.equal(Object.hasOwn(rows[0], 'scent_description'), false);
});
test('scent writes require an authenticated allowlisted admin before touching storage', async () => {
  for (const authorized of [false, true]) {
    const calls = [];
    const result = await processAdminRequest({ method: 'POST', headers: authorized ? { authorization: 'Bearer test-token' } : {}, body: { action: 'scent', id: 'NV-001', scent_description: 'forbidden' } }, {
      resource: 'media', env, fetchImpl: async (url) => { calls.push(url); return response({ id: 'customer', email: 'customer@example.test' }); }
    });
    assert.equal(result.status, authorized ? 403 : 401);
    assert.equal(calls.some(url => url.includes('/rest/')), false);
  }
});
