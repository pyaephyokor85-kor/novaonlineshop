import pricing from '../data/shop-pricing.json' with { type: 'json' };

const DEFAULT_MAX_QUANTITY = 99;
const MAX_TEXT_LENGTH = 500;

function text(value, field) {
  if (typeof value !== 'string') throw new Error(`${field} is required`);
  const result = value.trim();
  if (!result) throw new Error(`${field} is required`);
  if (result.length > MAX_TEXT_LENGTH) throw new Error(`${field} is too long`);
  return result;
}

export function validateOrder(body, catalogProducts, maxQuantity = DEFAULT_MAX_QUANTITY) {
  const customerName = text(body?.customerName, 'Customer name');
  const phone = text(body?.phone, 'Phone');
  const address = text(body?.address, 'Address');
  const productId = typeof body?.product?.id === 'string' ? body.product.id.trim() : '';
  const product = (Array.isArray(catalogProducts) ? catalogProducts : []).find(item => item.id === productId || item.code === productId);
  if (!product) throw new Error('Unknown NOVA product');

  if (typeof body?.size !== 'string' || !Object.hasOwn(pricing.sizes, body.size)) {
    throw new Error('Size must be one of 10ml or 30ml');
  }
  if (body.paymentMethod !== undefined && body.paymentMethod !== 'COD') {
    throw new Error('Payment method must be COD');
  }
  const quantity = body.quantity === undefined ? 1 : Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > maxQuantity) {
    throw new Error(`Quantity must be a whole number between 1 and ${maxQuantity}`);
  }
  const unitPrice = pricing.sizes[body.size];
  return {
    customerName, phone, address, product, quantity,
    size: body.size, paymentMethod: 'COD', unitPrice, total: unitPrice * quantity,
  };
}

export function orderMessage(order, now = new Date()) {
  return [
    '🧴 NOVA NEW ORDER',
    '',
    `Product: ${order.product.id} — ${order.product.name}`,
    `Size: ${order.size}`,
    `Unit price: ${order.unitPrice.toLocaleString('en-US')} Ks`,
    `Quantity: ${order.quantity}`,
    `Merchandise subtotal: ${order.total.toLocaleString('en-US')} Ks`,
    'Payment: COD — အိမ်ရောက်ငွေချေ',
    'Delivery fee: Unconfirmed (not included in merchandise subtotal)',
    '',
    `Customer: ${order.customerName}`,
    `Phone: ${order.phone}`,
    `Address: ${order.address}`,
    '',
    `Received: ${now.toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })}`,
  ].join('\n');
}

export async function processOrderNotification(req, { catalogProducts, fetchImpl = globalThis.fetch, env = process.env } = {}) {
  if (req.method !== 'POST') return { status: 405, body: { error: 'POST required' } };
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { status: 503, body: { error: 'Telegram notification is not configured yet.' } };

  let body;
  let order;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    order = validateOrder(body, catalogProducts);
  } catch (error) {
    const message = error instanceof SyntaxError ? 'Invalid JSON' : (error.message || 'Invalid order.');
    return { status: 400, body: { error: message } };
  }
  try {
    const telegram = await fetchImpl(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: orderMessage(order) }),
    });
    const result = await telegram.json().catch(() => ({}));
    if (!telegram.ok || !result.ok) return { status: 502, body: { error: 'Telegram could not receive the order notification.' } };
    return { status: 200, body: { ok: true } };
  } catch (error) {
    return { status: 502, body: { error: 'Order notification service is unavailable.' } };
  }
}

export function createVercelOrderHandler({ catalogProducts, fetchImpl, env } = {}) {
  return async function handler(req, res) {
    if (req.method === 'OPTIONS') return res.status(204).end();
    const result = await processOrderNotification(req, { catalogProducts, fetchImpl, env });
    return res.status(result.status).json(result.body);
  };
}
