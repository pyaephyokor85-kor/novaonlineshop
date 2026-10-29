function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
function widthValue(value) { return Number(value) === 110 ? 110 : 80; }
function money(value) { return `${Number(value || 0).toLocaleString('en-US')} Ks`; }
function printableOrder(order) {
  const items = (order.nova_order_items || []).map(item => {
    const description = `${escapeHtml(item.product_name)}<br><small>${escapeHtml(item.product_id)} · ${escapeHtml(item.size || '')}</small>`;
    return `<tr><td>${description}</td><td>${escapeHtml(item.quantity)}</td><td>${escapeHtml(money(item.unit_price))}</td></tr>`;
  }).join('');
  const subtotal = Number(order.subtotal || 0);
  const discountPercent = Number(order.discount_percent || 0);
  const discountAmount = Number(order.discount_amount || 0);
  const total = Number(order.total ?? subtotal - discountAmount);
  return {
    itemRows: items || '<tr><td>—</td><td></td><td></td></tr>',
    number: escapeHtml(order.order_number || order.id),
    customer: escapeHtml(order.customer_name),
    phone: escapeHtml(order.phone),
    address: escapeHtml(order.address),
    status: escapeHtml(order.status || 'waiting'),
    date: escapeHtml(order.created_at ? new Date(order.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Yangon' }) : ''),
    subtotal: escapeHtml(money(subtotal)),
    discount: discountPercent > 0 ? `<div class="summary"><span>Discount (${escapeHtml(discountPercent)}%)</span><b>−${escapeHtml(money(discountAmount))}</b></div>` : '',
    total: escapeHtml(money(total)),
  };
}
function shell(width, pageHeight, body) {
  const initialHeight = pageHeight ?? width;
  const measureReceiptHeight = pageHeight == null ? `
    const paper = document.querySelector('.paper');
    const pageSize = document.getElementById('page-size');
    const bodyStyle = getComputedStyle(document.body);
    const lastChild = paper.lastElementChild;
    const trailingMarginPx = lastChild ? parseFloat(getComputedStyle(lastChild).marginBottom) : 0;
    const pageHeightPx = paper.getBoundingClientRect().height
      + parseFloat(bodyStyle.paddingTop)
      + parseFloat(bodyStyle.paddingBottom)
      + trailingMarginPx
      + 2;
    const pageHeightMm = Math.ceil(pageHeightPx * 25.4 / 96);
    pageSize.textContent = '@page{size:${width}mm ' + pageHeightMm + 'mm;margin:0}';
  ` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NOVA print</title><style id="page-size">@page{size:${width}mm ${initialHeight}mm;margin:0}</style><style>
    *{box-sizing:border-box}html,body{margin:0;padding:0;width:${width}mm;font-family:Arial,"Noto Sans Myanmar",sans-serif;color:#111}body{padding:4mm}.paper{width:100%;font-size:12px;line-height:1.45;overflow-wrap:anywhere}.brand{text-align:center;font-size:20px;font-weight:800;letter-spacing:3px}.muted{color:#555;font-size:10px}.rule{border-top:1px dashed #555;margin:8px 0}.meta{margin:4px 0}.address{font-size:15px;font-weight:700;line-height:1.55}.phone{font-size:16px;font-weight:700}.items{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}.items td{padding:4px 1px;border-bottom:1px dashed #aaa;vertical-align:top}.items td:last-child{text-align:right}.summary{display:flex;justify-content:space-between;gap:8px;margin:5px 0}.grand{font-size:15px;font-weight:800}.label-title{font-weight:800;font-size:14px;letter-spacing:1px;margin:8px 0}.no-print{margin:12px auto;text-align:center;font:14px Arial}.no-print button{padding:10px 16px}@media print{.no-print{display:none}}
  </style></head><body>${body}<div class="no-print"><button onclick="window.print()">Print</button></div><script>
    window.addEventListener('load', () => {
      ${measureReceiptHeight}
      setTimeout(() => window.print(), 250);
    });
  </script></body></html>`;
}
export function buildReceiptHtml(order, paperWidth = 80) {
  const width = widthValue(paperWidth);
  const data = printableOrder(order);
  const body = `<main class="paper"><div class="brand">NOVA</div><div class="muted" style="text-align:center">COD ORDER RECEIPT</div><div class="rule"></div><div class="meta"><b>Order:</b> ${data.number}</div><div class="meta"><b>Status:</b> ${data.status}</div><div class="meta"><b>Date:</b> ${data.date}</div><div class="rule"></div><div><b>Customer:</b> ${data.customer}</div><div><b>Phone:</b> ${data.phone}</div><table class="items"><thead><tr><td>ITEM / SIZE</td><td>QTY</td><td>UNIT</td></tr></thead><tbody>${data.itemRows}</tbody></table><div class="rule"></div><div class="summary"><span>Merchandise subtotal</span><b>${data.subtotal}</b></div>${data.discount}<div class="summary grand"><span>COD total</span><b>${data.total}</b></div><div class="muted">Cash on delivery. Delivery fee is not included and will be confirmed separately.</div><p style="text-align:center;margin-top:12px">Thank you for choosing NOVA</p></main>`;
  return shell(width, null, body);
}
export function buildAddressLabelHtml(order, paperWidth = 80) {
  const width = widthValue(paperWidth);
  const data = printableOrder(order);
  const body = `<main class="paper"><div class="brand">NOVA</div><div class="label-title">DELIVER TO</div><div class="rule"></div><div class="address">${data.customer}</div><div class="phone">${data.phone}</div><div class="rule"></div><div class="address">${data.address}</div><div class="rule"></div><div class="muted">Order ${data.number} · ${data.status}</div></main>`;
  return shell(width, 100, body);
}

function thermerText(value, limit = 512) {
  // The app supports <br /> markup: never pass customer-supplied markup or raw ESC/POS controls.
  return String(value ?? '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/</g, '[').replace(/>/g, ']').trim().slice(0, limit);
}

export function buildThermerReceiptData(order) {
  const requiredText = [order.order_number || order.id, order.customer_name, order.phone];
  const rawAmounts = [order.subtotal, order.discount_percent, order.discount_amount, order.total];
  if (requiredText.some(value => typeof value !== 'string' || !value.trim()) || rawAmounts.some(value => value == null || value === '')) throw new Error('A complete saved receipt is required.');
  const subtotal = Number(order.subtotal); const discountPercent = Number(order.discount_percent);
  const discountAmount = Number(order.discount_amount); const total = Number(order.total);
  const rawItems = order.nova_order_items;
const items = Array.isArray(rawItems) ? rawItems : rawItems && typeof rawItems === 'object' ? [rawItems] : [];
  if (String(order.payment_method).toUpperCase() !== 'COD' || ![subtotal, discountAmount, total].every(value => Number.isSafeInteger(value) && value >= 0) || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100 || discountAmount !== Math.round(subtotal * discountPercent / 100) || total !== subtotal - discountAmount || !Array.isArray(items) || items.length < 1 || items.length > 50) throw new Error('A valid saved COD receipt snapshot is required.');
  let itemSubtotal = 0;
  for (const item of items) {
    const quantity = Number(item.quantity); const unit = Number(item.unit_price); const line = Number(item.line_total);
    if ([item.product_id, item.product_name, item.size].some(value => typeof value !== 'string' || !value.trim()) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99 || !Number.isSafeInteger(unit) || unit <= 0 || !Number.isSafeInteger(line) || line !== unit * quantity) throw new Error('A valid saved receipt item is required.');
    itemSubtotal += line;
  }
  if (itemSubtotal !== subtotal) throw new Error('Receipt items do not match the saved subtotal.');
  const entries = [];
  const text = (content, bold = 0, align = 0, format = 0) => entries.push({ type: 0, content: thermerText(content), bold, align, format });
  text('NOVA', 1, 1, 3); text('COD ORDER RECEIPT', 1, 1); text(' ');
  text(`Order: ${order.order_number || order.id}`); text(`Status: ${order.status || 'waiting'}`);
  if (order.created_at) {
    const date = new Date(order.created_at);
    if (!Number.isNaN(date.getTime())) text(`Date: ${date.toLocaleString('en-GB', { timeZone: 'Asia/Yangon' })}`);
  }
  text(`Customer: ${order.customer_name}`); text(`Phone: ${order.phone}`); text('--------------------------------');
  for (const item of items) {
    text(item.product_name, 1); text(`${item.product_id} / ${item.size} x ${item.quantity}`);
    text(`Unit: ${money(item.unit_price)}`); text(`Line: ${money(item.line_total)}`);
  }
  text('--------------------------------'); text(`Merchandise subtotal: ${money(subtotal)}`);
  if (discountPercent > 0) text(`Discount (${discountPercent}%): -${money(discountAmount)}`);
  text(`COD total: ${money(total)}`, 1); text('Cash on delivery.'); text('Delivery fee NOT included.'); text('Confirm delivery fee separately.');
  text(' '); text('Thank you for choosing NOVA', 0, 1); text(' '); text(' ');
  // Mirror the supplied PHP json_encode(..., JSON_FORCE_OBJECT) example, not an HTML document.
  return Object.fromEntries(entries.map((entry, index) => [String(index), { ...entry, content: entry.content || ' ' }]));
}
