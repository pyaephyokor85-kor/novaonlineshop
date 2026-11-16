const sizes = new Set(['10ml', '30ml']);
export function myanmarDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yangon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function validReportDay(value, now = new Date()) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value && value >= '2000-01-01' && value <= myanmarDay(now);
}
export function validateBottleChange(body) {
  if (!/^NV-(00[1-9]|0[12][0-9]|03[0-2])$/.test(body.productId || '') || !sizes.has(body.size)) throw new Error('အနံ့နဲ့ 10ml / 30ml ကို ရွေးပါ။');
  if (!Number.isSafeInteger(body.delta) || body.delta === 0 || Math.abs(body.delta) > 1000000) throw new Error('အရေအတွက်ကို 1 မှ 1,000,000 အတွင်း ကိန်းပြည့်ဖြည့်ပါ။');
  if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.trim().length > 500) throw new Error('အဝင်/အထွက် အကြောင်းရင်း ဖြည့်ပါ။');
  if (typeof body.requestId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(body.requestId)) throw new Error('A valid stock request key is required.');
  if (body.orderNumber != null && (typeof body.orderNumber !== 'string' || body.orderNumber.length > 100)) throw new Error('Order number is too long.');
  return { p_product_id: body.productId, p_size: body.size, p_delta: body.delta, p_reason: body.reason.trim(), p_order_number: body.orderNumber?.trim() || null, p_request_id: body.requestId };
}
export function stockView(req) {
  return new URL(req.url || '/', 'http://localhost').searchParams.get('view') || req.query?.view || '';
}
export async function processBottleStock(req, { baseUrl, headers, fetchImpl, email }) {
  const view = stockView(req);
  const read = async (path, options = {}) => {
    const r = await fetchImpl(`${baseUrl}/rest/v1/${path}`, { headers, ...options });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.message || 'Stock service unavailable.');
    return data;
  };
  try {
    if (req.method === 'GET' && view === 'bottles') {
      const variants = await read('nova_stock_variants?select=product_id,size,quantity,updated_at&order=product_id.asc,size.asc');
      return { status: 200, body: { variants } };
    }
    if (req.method === 'GET' && view === 'daily') {
      const day = new URL(req.url || '/', 'http://localhost').searchParams.get('date') || req.query?.date;
      if (!validReportDay(day)) return { status: 400, body: { error: 'မှန်ကန်တဲ့ ရက်စွဲ (YYYY-MM-DD) ကို ဖြည့်ပါ။ အနာဂတ်ရက် မရွေးပါနဲ့။' } };
      const report = await read('rpc/nova_stock_daily_report', { method: 'POST', body: JSON.stringify({ p_day: day }) });
      return { status: 200, body: { report } };
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    let args;
    try { args = validateBottleChange(body || {}); } catch (error) { return { status: 400, body: { error: error.message } }; }
    const result = await read('rpc/adjust_nova_stock', { method: 'POST', body: JSON.stringify({ ...args, p_actor_email: email }) });
    return { status: 200, body: result };
  } catch (error) {
    return { status: /cannot become negative|already used/.test(error.message) ? 409 : 502, body: { error: error.message } };
  }
}
