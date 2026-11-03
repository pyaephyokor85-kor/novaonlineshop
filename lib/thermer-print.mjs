import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { buildThermerReceiptData } from './print-templates.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSE = 'nova-preview-thermer-receipt-v1';
const TEST_ORDER_NUMBER = 'NOVA-261027-9F8B1A';
const TEST_CUSTOMER_NAME = 'FAKE QA 10ML - DO NOT SHIP';
export const THERMER_TICKET_SECONDS = 120;
export const THERMER_RESPONSE_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store, max-age=0',
  'Pragma': 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
});

function printConfig(env) {
  if (env.VERCEL_ENV !== 'preview' || env.NOVA_ORDER_STORAGE_ENABLED !== 'true' || env.NOVA_THERMER_PRINT_ENABLED !== 'true') {
    throw new Error('Thermer printing is disabled for this environment.');
  }
  // Deliberately do not fall back to any legacy/Production Supabase variables.
  const previewUrl = env.EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL || '';
  const serviceKey = env.NOVA_PREVIEW_SUPABASE_SERVICE_ROLE_KEY || '';
  const signingSecret = env.NOVA_PRINT_TOKEN_SECRET || '';
  let url;
  try { url = new URL(previewUrl); } catch { /* Fail closed below. */ }
  if (!url || url.protocol !== 'https:' || url.pathname !== '/' || url.username || url.password || url.search || url.hash || !serviceKey || signingSecret.length < 32) {
    throw new Error('Preview Thermer printing is not configured.');
  }
  return { baseUrl: url.origin, serviceKey, signingSecret };
}

const serviceHeaders = key => ({ apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' });
const unavailable = error => ({ status: 503, body: { error: error.message } });
const invalidLink = () => ({ status: 401, body: { error: 'Print link is invalid or expired. Prepare a new link in Preview admin.' } });

function relayResponseUrl(env, token = '') {
  let url;
  try { url = new URL(env.NOVA_THERMER_RELAY_URL || ''); } catch { /* Fail closed below. */ }
  if (!url || url.protocol !== 'https:' || url.pathname !== '/api/receipt' || url.username || url.password || url.search || url.hash || !url.hostname.endsWith('.vercel.app')) {
    throw new Error('The dedicated Preview Thermer relay is not configured.');
  }
  if (token) url.searchParams.set('token', token);
  return url.href;
}

const isFakeTestOrder = order => order?.order_number === TEST_ORDER_NUMBER && order?.customer_name === TEST_CUSTOMER_NAME;
const testOnly = () => ({ status: 403, body: { error: 'This Preview test is restricted to the existing fake QA receipt.' } });

async function authorizeStaff(req, config, env, fetchImpl) {
  const rawHeader = req.headers?.authorization || req.headers?.Authorization || '';
  const accessToken = typeof rawHeader === 'string' && rawHeader.startsWith('Bearer ') ? rawHeader.slice(7).trim() : '';
  if (!accessToken) return { status: 401, body: { error: 'Sign in with an authorized NOVA staff account.' } };
  let response; let user;
  try {
    response = await fetchImpl(`${config.baseUrl}/auth/v1/user`, { headers: { apikey: config.serviceKey, Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000) });
    user = await response.json().catch(() => ({}));
  } catch { return { status: 502, body: { error: 'Could not verify the staff session.' } }; }
  if (!response.ok || !user.id || !user.email) return { status: 401, body: { error: 'Your staff session is invalid or expired.' } };
  const allowed = String(env.NOVA_ADMIN_EMAILS || '').split(',').map(email => email.trim().toLowerCase()).filter(Boolean);
  if (!allowed.includes(String(user.email).trim().toLowerCase())) return { status: 403, body: { error: 'This account is not authorized for NOVA Preview administration.' } };
  return null;
}

async function singleOrder(config, orderId, select, fetchImpl) {
  const query = new URLSearchParams({ id: `eq.${orderId}`, select, limit: '1' });
  const response = await fetchImpl(`${config.baseUrl}/rest/v1/nova_orders?${query}`, { headers: serviceHeaders(config.serviceKey), signal: AbortSignal.timeout(8000) });
  const rows = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(rows)) throw new Error('Could not read the Preview order.');
  return rows[0] || null;
}

function signTicket(orderId, signingSecret, nowMs) {
  const issuedAt = Math.floor(nowMs / 1000);
  const claims = { purpose: PURPOSE, orderId, iat: issuedAt, exp: issuedAt + THERMER_TICKET_SECONDS, nonce: randomBytes(16).toString('base64url') };
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const signature = createHmac('sha256', signingSecret).update(payload).digest('base64url');
  return { token: `${payload}.${signature}`, expiresAt: new Date(claims.exp * 1000).toISOString() };
}

function verifyTicket(token, signingSecret, nowMs) {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) return null;
  try {
    const expected = createHmac('sha256', signingSecret).update(parts[0]).digest();
    const received = Buffer.from(parts[1], 'base64url');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const claims = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const now = Math.floor(nowMs / 1000);
    if (claims.purpose !== PURPOSE || !UUID_PATTERN.test(claims.orderId || '') || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.exp - claims.iat !== THERMER_TICKET_SECONDS || claims.iat > now + 30 || claims.exp <= now || !/^[A-Za-z0-9_-]{22}$/.test(claims.nonce || '')) return null;
    return claims;
  } catch { return null; }
}

export async function processThermerTicketRequest(req, { env = process.env, fetchImpl = globalThis.fetch, nowMs = Date.now() } = {}) {
  if (req.method !== 'POST') return { status: 405, body: { error: 'POST required' } };
  let config;
  try { config = printConfig(env); relayResponseUrl(env); } catch (error) { return unavailable(error); }
  const denied = await authorizeStaff(req, config, env, fetchImpl);
  if (denied) return denied;
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return { status: 400, body: { error: 'A JSON object body is required.' } }; }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.orderId !== 'string' || !UUID_PATTERN.test(body.orderId)) return { status: 400, body: { error: 'A valid order ID is required.' } };
  try {
    const orderId = body.orderId.toLowerCase();
    const order = await singleOrder(config, orderId, 'id,order_number,customer_name', fetchImpl);
    if (!order || order.id !== orderId) return { status: 404, body: { error: 'Preview order not found.' } };
    if (!isFakeTestOrder(order)) return testOnly();
    const ticket = signTicket(order.id, config.signingSecret, nowMs);
    return { status: 200, body: { ...ticket, responseUrl: relayResponseUrl(env, ticket.token), paperWidth: 80 } };
  } catch { return { status: 502, body: { error: 'Could not prepare the Preview receipt.' } }; }
}

export async function processThermerResponseRequest(req, { env = process.env, fetchImpl = globalThis.fetch, nowMs = Date.now() } = {}) {
  if (req.method !== 'GET') return { status: 405, body: { error: 'GET required' } };
  let config;
  try { config = printConfig(env); } catch (error) { return unavailable(error); }
  let tokens;
  try { tokens = new URL(req.url || '', 'https://preview.invalid').searchParams.getAll('token'); } catch { return invalidLink(); }
  const claims = tokens.length === 1 ? verifyTicket(tokens[0], config.signingSecret, nowMs) : null;
  if (!claims) return invalidLink();
  try {
    // Receipt data only: no address, idempotency key, staff history, or other orders.
    const select = 'id,order_number,status,customer_name,phone,payment_method,created_at,subtotal,discount_percent,discount_amount,total,nova_order_items(product_id,product_name,size,unit_price,quantity,line_total)';
    const order = await singleOrder(config, claims.orderId, select, fetchImpl);
    if (!order || order.id !== claims.orderId) return { status: 404, body: { error: 'Preview order not found.' } };
    if (!isFakeTestOrder(order)) return testOnly();
    return { status: 200, body: buildThermerReceiptData(order) };
  } catch { return { status: 502, body: { error: 'Could not read the Preview receipt.' } }; }
}
