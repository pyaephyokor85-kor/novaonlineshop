import QRCode from 'qrcode';
import settings from '../data/print-settings.json' with { type: 'json' };
const clean = value => String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 1500);
const money = value => `${Number(value).toLocaleString('en-US')} Ks`;
export const NOVA_QR_URL = settings.shopUrl;
export function slipData(order) {
  const raw = order?.nova_order_items;
  const items = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  if (!order || !String(order.order_number || order.id || '').trim() || !order.customer_name || !order.phone || (!items.length || items.length > 50)) throw new Error('Order slip အတွက် သိမ်းထားတဲ့ အော်ဒါအချက်အလက် မပြည့်စုံပါ။');
  let subtotal = 0;
  for (const item of items) {
    if (!item.product_id || !item.product_name || !item.size || !Number.isInteger(Number(item.quantity)) || (Number(item.quantity) < 1 || Number(item.quantity) > 99) || !Number.isSafeInteger(Number(item.unit_price)) || Number(item.unit_price) <= 0 || Number(item.line_total) !== Number(item.quantity) * Number(item.unit_price)) throw new Error('Order item အချက်အလက်ကို ပြန်စစ်ပေးပါ။');
    subtotal += Number(item.line_total);
  }
  const discount = Number(order.discount_amount), total = Number(order.total), percent = Number(order.discount_percent);
  if (!Number.isSafeInteger(subtotal) || subtotal !== Number(order.subtotal) || !Number.isFinite(percent) || percent < 0 || percent > 100 || discount !== Math.round(subtotal * percent / 100) || !Number.isSafeInteger(total) || total !== subtotal - discount || String(order.payment_method).toUpperCase() !== 'COD') throw new Error('သိမ်းထားတဲ့ အော်ဒါစုစုပေါင်းကို ပြန်စစ်ပေးပါ။');
  const date = new Date(order.created_at);
  return { number: clean(order.order_number || order.id), customer: clean(order.customer_name), phone: clean(order.phone), address: clean(order.address), date: Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-GB', { timeZone: 'Asia/Yangon' }), items: items.map(item => ({ ...item, product_id: clean(item.product_id), product_name: clean(item.product_name), size: clean(item.size) })), subtotal, discount, percent, total, quantity: items.reduce((sum,item) => sum + Number(item.quantity), 0) };
}
export function qrSvg(url = NOVA_QR_URL) {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size, margin = 4;
  let path = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(y,x)) path += `M${x+margin} ${y+margin}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n+margin*2} ${n+margin*2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="white"/><path d="${path}" fill="black"/></svg>`;
}
export function wrapSlipText(text, measure, maxWidth) {
  const segments = typeof Intl.Segmenter === 'function' ? [...new Intl.Segmenter('my', { granularity: 'grapheme' }).segment(clean(text))].map(part => part.segment) : Array.from(clean(text));
  const lines = []; let line = '';
  for (const part of segments) {
    if (part === '\n') { lines.push(line); line = ''; continue; }
    if (line && measure(line + part) > maxWidth) { lines.push(line.trimEnd()); line = part.trimStart(); } else line += part;
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}
export async function renderOrderSlip(order, paperWidth = 80) {
  if (typeof document === 'undefined') throw new Error('Order slip ကို Web app မှာ ဖွင့်ပေးပါ။');
  const data = slipData(order);
  await document.fonts?.ready;
  const widthMm = 80, heightMm = 110, dots = 576, pageDots = 792;
  const pad = 20, usable = dots - pad*2;
  const measureCanvas = document.createElement('canvas'), measure = measureCanvas.getContext('2d');
  if (!measure) throw new Error('Slip image ဖန်တီးမရပါ။');
  const sheets = [[]]; let operations = sheets[0], y = 18;
  const ensure = height => {
    if (y + height <= pageDots - pad) return;
    operations = []; sheets.push(operations); y = pad;
    operations.push({ type:'text', text:`NOVA · ${data.number} · continued`, font:'700 16px Arial, sans-serif', x:pad, y, align:'left' }); y += 30;
  };
  const text = (value, size = 18, bold = false, align = 'left', maxWidth = usable, x = pad) => {
    const font = `${bold ? '700' : '400'} ${size}px Arial, "Noto Sans Myanmar", "Myanmar Sangam MN", sans-serif`;
    measure.font = font;
    for (const line of wrapSlipText(value, value => measure.measureText(value).width, maxWidth)) {
      const height = Math.ceil(size*1.45); ensure(height);
      operations.push({ type:'text', text:line, font, x:align === 'center' ? dots/2 : x, y, align }); y += height;
    }
  };
  const rule = () => { ensure(18); y += 5; operations.push({ type:'rule', y }); y += 12; };
  // Compact courier form: QR/order header, shipper, consignee, goods and COD.
  // Each two-column row is measured as a unit, so long names cannot overlap phones.
  const pair = (left, right, size = 18, bold = false) => {
    const gap = 16, column = (usable - gap) / 2;
    const font = `${bold ? '700' : '400'} ${size}px Arial, "Noto Sans Myanmar", "Myanmar Sangam MN", sans-serif`;
    measure.font = font;
    const lines = [left, right].map(value => wrapSlipText(value, value => measure.measureText(value).width, column));
    const lineHeight = Math.ceil(size * 1.45), height = Math.max(...lines.map(row => row.length)) * lineHeight;
    ensure(height);
    lines.forEach((row, side) => row.forEach((line, index) => operations.push({ type:'text', text:line, font, x:pad + side * (column + gap), y:y + index * lineHeight, align:'left' })));
    y += height;
  };
  const qr = QRCode.create(NOVA_QR_URL, { errorCorrectionLevel: 'M' });
  const scale = 3, qrSize = (qr.modules.size + 8) * scale;
  operations.push({ type:'qr', qr, scale, x:pad, y:14 });
  const headerX = pad + qrSize + 16, headerWidth = dots - pad - headerX;
  text('NOVA · DELIVERY SLIP',22,true,'left',headerWidth,headerX);
  text(data.number,19,true,'left',headerWidth,headerX);
  if (data.date) text(data.date,16,false,'left',headerWidth,headerX);
  y = Math.max(y,qrSize + 20); rule();
  text('SHIPPER / ပို့သူ',17,true);
  pair('NOVA Inspired Perfume',settings.phone,18,true);
  text(`Telegram: ${settings.telegram}`,16);
  rule();
  text('CONSIGNEE / လက်ခံသူ',17,true);
  pair(data.customer,data.phone,20,true);
  text(data.address || 'လိပ်စာ မဖြည့်ရသေးပါ။',20);
  rule();
  text('GOODS / ပစ္စည်းစာရင်း',17,true);
  for (const item of data.items) {
    ensure(58);
    text(`${item.product_id} · ${item.product_name}`,18,true);
    pair(`${item.size} × ${item.quantity}`,money(item.line_total),17);
    y += 3;
  }
  rule();
  pair(`Qty / အရေအတွက်: ${data.quantity}`,`Subtotal: ${money(data.subtotal)}`,17);
  if (data.discount > 0) pair(`Discount (${data.percent}%)`,`−${money(data.discount)}`,17);
  pair('C.O.D. TOTAL',money(data.total),23,true);
  rule();
  pair('Payment / ငွေပေးချေမှု','COD / အိမ်ရောက်ငွေချေ',17);
  rule();
  pair('Category / ပစ္စည်းအမျိုးအစား','Perfume / ရေမွှေး',17);
  rule();
  text('NOVA ONLINE SHOP',16,true,'center');
  text(NOVA_QR_URL,15,false,'center');
  const filename = `NOVA-${data.number.replace(/[^a-zA-Z0-9_-]/g,'_')}`;
  const pages = [];
  for (const sheet of sheets) {
    const canvas = document.createElement('canvas'); canvas.width = dots; canvas.height = pageDots;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,dots,pageDots); ctx.fillStyle = '#000'; ctx.textBaseline = 'top';
    for (const op of sheet) {
      if (op.type === 'text') { ctx.font = op.font; ctx.textAlign = op.align; ctx.fillText(op.text,op.x,op.y); }
      else if (op.type === 'rule') ctx.fillRect(pad,op.y,usable,1);
      else for (let r=0;r<op.qr.modules.size;r++) for(let c=0;c<op.qr.modules.size;c++) if(op.qr.modules.get(r,c)) ctx.fillRect(op.x+(c+4)*op.scale,op.y+(r+4)*op.scale,op.scale,op.scale);
    }
    ctx.font = '14px Arial'; ctx.textAlign = 'right'; ctx.fillText(`${pages.length+1} / ${sheets.length}`,dots-pad,pageDots-18);
    const png = await new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png'));
    pages.push({ canvas, png, dataUrl:canvas.toDataURL('image/png'), widthMm, heightMm, filename:`${filename}-${pages.length+1}` });
  }
  return { ...pages[0], filename, pages };
}
export function downloadSlipBlob(blob, filename) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export async function exportSlipPdf(slip) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: slip.heightMm >= slip.widthMm ? 'portrait' : 'landscape', unit:'mm', format:[slip.widthMm,slip.heightMm], compress:true });
  (slip.pages || [slip]).forEach((page,index) => {
    if (index) doc.addPage([80,110],'portrait');
    doc.addImage(page.dataUrl,'PNG',0,0,80,110);
  });
  downloadSlipBlob(doc.output('blob'),`${slip.filename}.pdf`);
}
export function shareSlip(slip) {
  const file = new File([slip.png],`${slip.filename}.png`,{type:'image/png'});
  if (!navigator.canShare?.({ files:[file] }) || !navigator.share) throw new Error('ဒီ browser မှာ file share မရပါ။ Save PNG နှိပ်ပြီး Files ထဲက Share → Thermer ကိုရွေးပါ။');
  return navigator.share({ files:[file], title:'NOVA order slip' });
}
