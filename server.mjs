import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { processOrderNotification } from './lib/order-notification.mjs';
import { processAdminRequest, processPublicDiscountRequest } from './lib/order-management.mjs';
import scentAdvisorHandler from './api/scent-advisor.mjs';

const port = Number(process.env.PORT || 8787);
const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
const model = process.env.LLM_MODEL || (provider === 'anthropic' ? 'claude-3-5-haiku-latest' : 'gpt-5-mini');
const appRoot = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(appRoot, 'data');
const profileDir = path.join(dataDir, 'profiles');
const profileFile = (id) => {
  const value = String(id);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error('Unsafe profile id');
  return path.join(profileDir, `${value}.json`);
};
const emptyProfile = { favoriteFamilies: [], preferredNotes: [], moods: [], occasions: [], dislikes: [] };
const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
fs.mkdirSync(profileDir, { recursive: true });
const catalogProducts = JSON.parse(fs.readFileSync(path.join(dataDir, 'nova-catalog.json'), 'utf8'));

function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS' }); res.end(JSON.stringify(body)); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = []; let size = 0; let settled = false;
    const fail = error => { if (!settled) { settled = true; reject(error); } };
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > 100_000) {
        chunks = [];
        const error = new Error('Payload too large'); error.statusCode = 413;
        fail(error); req.resume(); return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        settled = true; resolve(value);
      } catch {
        const error = new Error('Invalid JSON'); error.statusCode = 400; fail(error);
      }
    });
    req.on('error', fail);
  });
}
function bearer(req) { const value = req.headers.authorization || ''; return value.startsWith('Bearer ') ? value.slice(7).trim() : ''; }
async function authenticatedSupabaseUser(req) {
  const token = bearer(req);
  if (!supabaseUrl || !supabaseKey) return { error: 'Supabase server configuration is missing', status: 503 };
  if (!token) return { error: 'Authorization bearer token is required', status: 401 };
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.id) return { error: 'Invalid or expired Supabase session', status: 401 };
  return { token, user: data };
}
function cloudRow(userId, profile) { return { user_id: userId, favorite_families: profile.favoriteFamilies || [], preferred_notes: profile.preferredNotes || [], moods: profile.moods || [], occasions: profile.occasions || [], dislikes: profile.dislikes || [], last_recommendation: profile.lastRecommendation || null }; }
function cloudProfile(row) { return { favoriteFamilies: row.favorite_families || [], preferredNotes: row.preferred_notes || [], moods: row.moods || [], occasions: row.occasions || [], dislikes: row.dislikes || [], lastRecommendation: row.last_recommendation || undefined, updatedAt: row.updated_at || undefined }; }
async function readCloudProfile(req) {
  const auth = await authenticatedSupabaseUser(req); if (auth.error) return auth;
  const url = `${supabaseUrl}/rest/v1/fragrance_profiles?select=*&user_id=eq.${encodeURIComponent(auth.user.id)}`;
  const r = await fetch(url, { headers: { apikey: supabaseKey, Authorization: `Bearer ${auth.token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { error: data.message || 'Supabase profile read failed', status: r.status };
  return { user: auth.user, profile: data[0] ? cloudProfile(data[0]) : emptyProfile };
}
async function writeCloudProfile(req, profile) {
  const auth = await authenticatedSupabaseUser(req); if (auth.error) return auth;
  const r = await fetch(`${supabaseUrl}/rest/v1/fragrance_profiles?on_conflict=user_id`, { method: 'POST', headers: { apikey: supabaseKey, Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(cloudRow(auth.user.id, profile)) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { error: data.message || 'Supabase profile write failed', status: r.status };
  return { user: auth.user, profile: data[0] ? cloudProfile(data[0]) : profile };
}
function readProfile(id) { try { return { ...emptyProfile, ...JSON.parse(fs.readFileSync(profileFile(id), 'utf8')) }; } catch { return { ...emptyProfile }; } }
function saveProfile(id, profile) { fs.writeFileSync(profileFile(id), JSON.stringify({ ...profile, updatedAt: new Date().toISOString() }, null, 2)); }
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, provider, model, memory: 'file-backed', supabase: Boolean(supabaseUrl && supabaseKey), catalogSize: catalogProducts.length });
  if (req.url === '/api/cloud-profile' && req.method === 'GET') { try { const result = await readCloudProfile(req); return json(res, result.error ? result.status : 200, result.error ? { error: result.error } : { profile: result.profile, user: { id: result.user.id, email: result.user.email } }); } catch (e) { return json(res, 502, { error: e.message }); } }
  if (req.url === '/api/cloud-profile' && (req.method === 'POST' || req.method === 'PUT')) { try { const body = await readBody(req); const result = await writeCloudProfile(req, body.profile || {}); return json(res, result.error ? result.status : 200, result.error ? { error: result.error } : { profile: result.profile, user: { id: result.user.id, email: result.user.email } }); } catch (e) { return json(res, 502, { error: e.message }); } }
  const match = req.url?.match(/^\/api\/profile\/([a-zA-Z0-9_-]+)$/);
  if (match && req.method === 'GET') return json(res, 200, { profile: readProfile(match[1]) });
  if (match && req.method === 'POST') { try { const body = await readBody(req); const profile = { ...readProfile(match[1]), ...(body.profile || {}) }; saveProfile(match[1], profile); return json(res, 200, { profile }); } catch (e) { return json(res, 400, { error: e.message }); } }
  if (req.url === '/api/cloud-purchases' && req.method === 'GET') { try { const auth = await authenticatedSupabaseUser(req); if (auth.error) return json(res, auth.status, { error: auth.error }); const r = await fetch(`${supabaseUrl}/rest/v1/fragrance_purchases?select=product_id,purchased_at,quantity,price&order=purchased_at.desc`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${auth.token}` } }); const data = await r.json().catch(() => ({})); return json(res, r.ok ? 200 : r.status, r.ok ? { purchases: data } : { error: data.message || 'Supabase purchase history read failed' }); } catch (e) { return json(res, 502, { error: e.message }); } }
  if (req.url === '/api/cloud-purchases' && req.method === 'POST') { try { const auth = await authenticatedSupabaseUser(req); if (auth.error) return json(res, auth.status, { error: auth.error }); const body = await readBody(req); const purchase = body.purchase || {}; if (!catalogProducts.some(x => x.id === String(purchase.productId || purchase.product_id))) return json(res, 400, { error: 'Unknown NOVA product' }); const row = { user_id: auth.user.id, product_id: String(purchase.productId || purchase.product_id), purchased_at: purchase.purchasedAt || purchase.purchased_at || new Date().toISOString(), quantity: Math.max(1, Number(purchase.quantity || 1)), price: purchase.price || null }; const r = await fetch(`${supabaseUrl}/rest/v1/fragrance_purchases`, { method: 'POST', headers: { apikey: supabaseKey, Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(row) }); const data = await r.json().catch(() => ({})); return json(res, r.ok ? 201 : r.status, r.ok ? { purchase: data[0] || row } : { error: data.message || 'Supabase purchase history write failed' }); } catch (e) { return json(res, 502, { error: e.message }); } }
  if (req.url === '/api/current-discount') { const result = await processPublicDiscountRequest({ method: req.method }); return json(res, result.status, result.body); }
  const adminMatch = req.url?.match(/^\/api\/admin\/(orders|inventory|discount)$/);
  if (adminMatch) {
    try {
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      const result = await processAdminRequest({ method: req.method, headers: req.headers, body }, { resource: adminMatch[1] });
      return json(res, result.status, result.body);
    } catch (error) { return json(res, error.statusCode || 400, { error: error.message || 'Admin request failed.' }); }
  }
  if (req.url === '/api/order-notification') {
    try {
      const body = req.method === 'POST' ? await readBody(req) : {};
      const result = await processOrderNotification({ method: req.method, body }, { catalogProducts });
      return json(res, result.status, result.body);
    } catch (error) { return json(res, error.statusCode || 400, { error: error.message }); }
  }
  if (req.url !== '/api/scent-advisor') return json(res, 404, { error: 'Not found' });
  try {
    const body = await readBody(req);
    const adapter = {
      method: req.method,
      body,
      status(code) { this.statusCode = code; return this; },
      json(payload) { return json(res, this.statusCode || 200, payload); },
      end() { res.statusCode = this.statusCode || 200; return res.end(); },
    };
    return await scentAdvisorHandler(adapter, adapter);
  } catch (e) {
    return json(res, e.statusCode || 502, { error: e.message || 'Advisor unavailable' });
  }
});
server.listen(port, '0.0.0.0', () => console.log(`NOVA AI server listening on http://0.0.0.0:${port} (${provider}/${model})`));
