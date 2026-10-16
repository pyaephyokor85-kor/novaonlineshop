function json(res, status, body) {
  res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return json(res, 405, { error: 'POST required' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return json(res, 503, { error: 'Telegram notification is not configured yet.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const customerName = String(body.customerName || '').trim();
    const phone = String(body.phone || '').trim();
    const address = String(body.address || '').trim();
    const product = body.product || {};
    const quantity = Math.max(1, Number(body.quantity || 1));
    if (!customerName || !phone || !address || !product.id || !product.name) return json(res, 400, { error: 'Customer name, phone, address, and product are required.' });

    const text = [
      '🧴 NOVA NEW ORDER',
      '',
      `Product: ${product.id} — ${product.name}`,
      `Price: ${product.price || 'N/A'}`,
      `Quantity: ${quantity}`,
      '',
      `Customer: ${customerName}`,
      `Phone: ${phone}`,
      `Address: ${address}`,
      '',
      `Received: ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })}`,
    ].join('\n');

    const telegram = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }) });
    const result = await telegram.json().catch(() => ({}));
    if (!telegram.ok || !result.ok) return json(res, 502, { error: 'Telegram could not receive the order notification.' });
    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Order notification failed.' });
  }
}
