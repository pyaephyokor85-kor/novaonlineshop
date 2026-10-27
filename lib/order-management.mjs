const ORDER_STATUSES = new Set(['waiting', 'confirmed', 'packing', 'delivery', 'cancelled']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateIdempotencyKey(value) {
  if (typeof value !== 'string' || value.length > 128 || !/^[A-Za-z0-9_-]{8,128}$/.test(value)) throw new Error('A valid order request key is required');
  return value;
}

export function validateStatusTransition(from, to) {
  const allowed = { waiting: ['confirmed', 'cancelled'], confirmed: ['packing', 'cancelled'], packing: ['delivery', 'cancelled'], delivery: [], cancelled: [] };
  if (!ORDER_STATUSES.has(to)) throw new Error('Unknown order status');
  if (!allowed[from]?.includes(to)) throw new Error(`Order cannot move from ${from} to ${to}`);
  return to;
}

function serviceConfig(env) {
  if (env.NOVA_ORDER_STORAGE_ENABLED !== 'true') throw new Error('Preview order administration is disabled');
  const baseUrl = String(env.EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL || env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.NOVA_PREVIEW_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!baseUrl || !serviceKey) throw new Error('Preview order administration is not configured');
  return { baseUrl, serviceKey };
}

async function responseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error_description || 'Preview storage request failed');
  return body;
}

const serviceHeaders = serviceKey => ({ apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' });

export async function createNovaOrder(order, idempotencyKey, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const { baseUrl, serviceKey } = serviceConfig(env);
  const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/create_nova_order`, {
    method: 'POST', headers: serviceHeaders(serviceKey),
    body: JSON.stringify({ p_idempotency_key: validateIdempotencyKey(idempotencyKey), p_customer_name: order.customerName, p_phone: order.phone, p_address: order.address, p_product_id: order.product.id, p_product_name: order.product.name, p_size: order.size, p_quantity: order.quantity }),
  });
  const payload = await responseJson(response);
  const record = Array.isArray(payload) ? payload[0] : payload;
  if (!record?.order_id || !record?.order_number || !Number.isFinite(Number(record.total))) throw new Error('Order storage returned an invalid financial snapshot');
  return record;
}

export async function processPublicDiscountRequest(req, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (req.method !== 'GET') return { status: 405, body: { error: 'GET required' } };
  if (env.NOVA_ORDER_STORAGE_ENABLED !== 'true') return { status: 200, body: { enabled: false, percent: 0 } };
  try {
    const { baseUrl, serviceKey } = serviceConfig(env);
    const response = await fetchImpl(`${baseUrl}/rest/v1/nova_discount_settings?select=enabled,percent&singleton=eq.true`, { headers: serviceHeaders(serviceKey) });
    const rows = await responseJson(response);
    const setting = rows[0];
    if (!setting) return { status: 503, body: { error: 'Preview discount settings are not initialized.' } };
    const enabled = Boolean(setting.enabled);
    return { status: 200, body: { enabled, percent: enabled ? Number(setting.percent) : 0 } };
  } catch (error) {
    return { status: 503, body: { error: error?.message || 'Preview discount settings are unavailable.' } };
  }
}

export async function processAdminRequest(req, { resource, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!['GET', 'POST'].includes(req.method)) return { status: 405, body: { error: 'GET or POST required' } };
  let config;
  try { config = serviceConfig(env); } catch (error) { return { status: 503, body: { error: error.message } }; }
  const { baseUrl, serviceKey } = config;
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const accessToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!accessToken) return { status: 401, body: { error: 'Sign in with an authorized NOVA staff account.' } };
  let user;
  try {
    const response = await fetchImpl(`${baseUrl}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${accessToken}` } });
    user = await response.json().catch(() => ({}));
    if (!response.ok || !user.id || !user.email) return { status: 401, body: { error: 'Your staff session is invalid or expired.' } };
  } catch { return { status: 502, body: { error: 'Could not verify the staff session.' } }; }
  const allowedEmails = String(env.NOVA_ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  const email = String(user.email).trim().toLowerCase();
  if (!allowedEmails.includes(email)) return { status: 403, body: { error: 'This account is not authorized for NOVA Preview administration.' } };

  const headers = serviceHeaders(serviceKey);
  try {
    if (resource === 'orders' && req.method === 'GET') {
      const response = await fetchImpl(`${baseUrl}/rest/v1/nova_orders?select=*,nova_order_items(*),nova_order_status_history(*)&order=created_at.desc&limit=200`, { headers });
      const orders = await responseJson(response);
      // The UNIQUE order_id makes PostgREST embed one item as an object, not an array.
      return { status: 200, body: { orders: orders.map(order => ({
        ...order,
        nova_order_items: Array.isArray(order.nova_order_items) ? order.nova_order_items : order.nova_order_items ? [order.nova_order_items] : [],
      })) } };
    }
    if (resource === 'inventory' && req.method === 'GET') {
      const [inventoryResponse, historyResponse] = await Promise.all([
        fetchImpl(`${baseUrl}/rest/v1/nova_inventory?select=*&order=product_id.asc`, { headers }),
        fetchImpl(`${baseUrl}/rest/v1/nova_inventory_adjustments?select=*&order=created_at.desc&limit=100`, { headers }),
      ]);
      const [inventory, adjustments] = await Promise.all([responseJson(inventoryResponse), responseJson(historyResponse)]);
      return { status: 200, body: { inventory, adjustments } };
    }
    if (resource === 'discount' && req.method === 'GET') {
      const response = await fetchImpl(`${baseUrl}/rest/v1/nova_discount_settings?select=enabled,percent,updated_by,updated_at&singleton=eq.true`, { headers });
      const rows = await responseJson(response);
      return { status: 200, body: { setting: rows[0] || { enabled: false, percent: 0 } } };
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (req.method !== 'POST' || !body || typeof body !== 'object' || Array.isArray(body)) return { status: 400, body: { error: 'A JSON object body is required.' } };
    if (resource === 'orders' && body.action === 'status') {
      if (typeof body.orderId !== 'string' || !UUID_PATTERN.test(body.orderId)) return { status: 400, body: { error: 'A valid order ID is required.' } };
      if (typeof body.reason !== 'undefined' && (typeof body.reason !== 'string' || body.reason.trim().length > 500)) return { status: 400, body: { error: 'Status note is too long.' } };
      const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/update_nova_order_status`, { method: 'POST', headers, body: JSON.stringify({ p_order_id: body.orderId, p_status: body.status, p_actor_email: email, p_reason: String(body.reason || '').trim() || null }) });
      return { status: 200, body: { order: await responseJson(response) } };
    }
    if (resource === 'inventory' && body.action === 'adjust') {
      const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
      const metric = body.metric;
      const delta = Number(body.delta);
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (!/^NV-\d{3}$/.test(productId)) return { status: 400, body: { error: 'A valid NOVA product is required.' } };
      if (!['units', 'ml'].includes(metric) || !Number.isFinite(delta) || delta === 0 || (metric === 'units' && !Number.isInteger(delta))) return { status: 400, body: { error: 'Enter a non-zero whole-number unit change or milliliter change.' } };
      if (metric === 'ml' && String(body.delta).split('.')[1]?.length > 2) return { status: 400, body: { error: 'Milliliter changes can use at most two decimal places.' } };
      if (Math.abs(delta) > 1000000) return { status: 400, body: { error: 'Adjustment is too large.' } };
      if (!reason || reason.length > 500) return { status: 400, body: { error: 'Enter a short reason for the stock adjustment.' } };
      const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/adjust_nova_inventory`, { method: 'POST', headers, body: JSON.stringify({ p_product_id: productId, p_metric: metric, p_delta: delta, p_reason: reason, p_actor_email: email }) });
      return { status: 200, body: { inventory: await responseJson(response) } };
    }
    if (resource === 'discount' && body.action === 'update') {
      const percent = Number(body.percent);
      if (typeof body.enabled !== 'boolean' || !Number.isFinite(percent) || percent < 0 || percent > 100 || String(body.percent).split('.')[1]?.length > 2) return { status: 400, body: { error: 'Choose on/off and a discount from 0 to 100%, up to two decimal places.' } };
      const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/update_nova_discount`, { method: 'POST', headers, body: JSON.stringify({ p_enabled: body.enabled, p_percent: percent, p_actor_email: email }) });
      return { status: 200, body: { setting: await responseJson(response) } };
    }
    return { status: 400, body: { error: 'Unknown admin action.' } };
  } catch (error) {
    const message = String(error?.message || 'Admin request failed');
    const status = /cannot move|unknown order status|cannot become negative|already used/i.test(message) ? 409 : /discount.*(100|precision|percentage)/i.test(message) ? 400 : 502;
    return { status, body: { error: message } };
  }
}
