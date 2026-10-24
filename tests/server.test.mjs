import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

let child;
let base;

before(async () => {
  const port = 18000 + Math.floor(Math.random() * 1000);
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, PORT: String(port), OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '', NOVA_ORDER_STORAGE_ENABLED: 'false', SUPABASE_SERVICE_ROLE_KEY: '', NOVA_ADMIN_EMAILS: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('server did not start');
});

after(() => child?.kill('SIGTERM'));

const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

test('health reports a live server', async () => {
  const response = await fetch(`${base}/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});

test('advisor uses shared handler fallback without an AI key', async () => {
  const response = await post('/api/scent-advisor', JSON.stringify({ message: 'I want a fresh daytime scent' }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.fallback, true);
  assert.ok(body.reply);
  assert.ok(Array.isArray(body.recommendations));
});

test('advisor rejects an invalid body', async () => {
  const response = await post('/api/scent-advisor', JSON.stringify({ message: '' }));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /message is required/);
});

test('order route reports missing Telegram configuration', async () => {
  const response = await post('/api/order-notification', JSON.stringify({ customerName: 'Preview Test', phone: '09', address: 'Fake Preview Address', quantity: 1, size: '10ml', paymentMethod: 'COD', product: { id: 'NV-001' } }));
  assert.equal(response.status, 503);
});

test('discount preview returns disabled by default when Preview storage is off', async () => {
  const response = await fetch(`${base}/api/current-discount`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { enabled: false, percent: 0 });
});

test('admin routes fail closed without the Preview storage flag', async () => {
  for (const resource of ['orders', 'inventory', 'discount']) {
    const response = await fetch(`${base}/api/admin/${resource}`);
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /disabled/);
  }
});

test('oversized request is rejected', async () => {
  const response = await post('/api/scent-advisor', JSON.stringify({ message: 'x'.repeat(100_001) }));
  assert.equal(response.status, 413);
  assert.match((await response.json()).error, /Payload too large/);
});

test('malformed JSON returns 400 instead of leaving requests pending', async () => {
  for (const path of ['/api/scent-advisor', '/api/order-notification']) {
    const response = await fetch(`${base}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: '{', signal: AbortSignal.timeout(2000),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Invalid JSON/);
  }
});
