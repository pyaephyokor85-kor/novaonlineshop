// Android Chrome Web Bluetooth / BLE ESC-POS. No native Android permissions needed.
const SERVICE = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
const WRITE = '49535343-8841-43f4-a8d4-ecbe34729bb3';
const encoder = new TextEncoder();
const safe = (v) => String(v ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '?').replace(/[\x00-\x1F\x7F]/g, ' ').slice(0, 500);
const money = (n) => `${Number(n || 0).toLocaleString('en-US')} Ks`;
const line = (label, value) => `${label}: ${safe(value)}\n`;
export function buildBlePrintText(order, kind = 'receipt') {
  let s = '          NOVA\n--------------------------------\n';
  if (kind === 'label') {
    s += 'DELIVER TO\n' + safe(order.customer_name) + '\n' + line('Phone', order.phone) + safe(order.address) + '\n' + line('Order', order.order_number || order.id);
  } else {
    s += 'COD ORDER RECEIPT\n' + line('Order', order.order_number || order.id) + line('Status', order.status);
    s += line('Customer', order.customer_name) + line('Phone', order.phone) + '--------------------------------\n';
    for (const item of (order.nova_order_items || [])) {
      s += `${safe(item.product_id)} ${safe(item.product_name)}\n${safe(item.size)} x ${Number(item.quantity)} @ ${money(item.unit_price)}\n`;
    }
    s += '--------------------------------\n' + line('Subtotal', money(order.subtotal));
    if (Number(order.discount_amount) > 0) s += line(`Discount ${order.discount_percent}%`, '-' + money(order.discount_amount));
    s += line('COD Total', money(order.total));
    s += 'Thank you for choosing NOVA\n';
  }
  return s + '\n\n\n';
}
export async function printBleOrder(order, kind = 'receipt') {
  if (!globalThis.isSecureContext || !navigator.bluetooth) throw new Error('Use Android Chrome on HTTPS. Web Bluetooth is unavailable here.');
  // Must run directly from the user tapping the print button.
  const device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: 'RPP02N' }], optionalServices: [SERVICE] });
  const server = await device.gatt.connect();
  try {
    const service = await server.getPrimaryService(SERVICE);
    const characteristic = await service.getCharacteristic(WRITE);
    const data = new Uint8Array([0x1b, 0x40, ...encoder.encode(buildBlePrintText(order, kind))]);
    // Conservative BLE payload size; avoid overloading the printer buffer.
    for (let i = 0; i < data.length; i += 20) {
      const chunk = data.slice(i, i + 20);
      if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) await characteristic.writeValueWithoutResponse(chunk);
      else if (characteristic.properties.write && characteristic.writeValueWithResponse) await characteristic.writeValueWithResponse(chunk);
      else await characteristic.writeValue(chunk);
      await new Promise(resolve => setTimeout(resolve, 45));
    }
  } finally { if (device.gatt.connected) device.gatt.disconnect(); }
}

// Raster output preserves Myanmar glyphs and the shop QR, independent of printer code pages.
export function rasterBand(rgba, width, height, startRow = 0, rows = height) {
  if (!Number.isInteger(width) || width < 8 || width > 832 || width % 8 || !Number.isInteger(height) || height < 1 || !Number.isInteger(startRow) || startRow < 0 || !Number.isInteger(rows) || rows < 1 || startRow + rows > height || rgba.length !== width * height * 4) throw new Error('Invalid raster dimensions');
  const bytesPerRow = width / 8;
  const data = new Uint8Array(8 + bytesPerRow * rows);
  data.set([0x1d,0x76,0x30,0,bytesPerRow&255,bytesPerRow>>8,rows&255,rows>>8]);
  for (let r=0;r<rows;r++) for(let c=0;c<width;c++) {
    const index = ((startRow+r)*width+c)*4;
    const alpha = rgba[index+3]/255;
    const luminance = (rgba[index]*0.299+rgba[index+1]*0.587+rgba[index+2]*0.114)*alpha + 255*(1-alpha);
    if (luminance < 160) data[8+r*bytesPerRow+(c>>3)] |= 0x80>>(c%8);
  }
  return data;
}
export async function printBleRaster(canvas) {
  if (!globalThis.isSecureContext || !navigator.bluetooth) throw new Error('Bluetooth browser printing မရပါ။ Share → Thermer သို့မဟုတ် Save PNG ကို သုံးပေးပါ။');
  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices:true, optionalServices:[SERVICE] });
  const server = await device.gatt.connect();
  try {
    let characteristic;
    try { characteristic = await (await server.getPrimaryService(SERVICE)).getCharacteristic(WRITE); }
    catch { throw new Error('ဒီ printer ရဲ့ BLE service မကိုက်ပါ။ Share PNG → Thermer နဲ့ ထုတ်ပေးပါ။'); }
    const write = async bytes => {
      for(let i=0;i<bytes.length;i+=20) {
        const chunk = bytes.slice(i,i+20);
        if (characteristic.properties.writeWithoutResponse && characteristic.writeValueWithoutResponse) await characteristic.writeValueWithoutResponse(chunk);
        else if (characteristic.properties.write && characteristic.writeValueWithResponse) await characteristic.writeValueWithResponse(chunk);
        else await characteristic.writeValue(chunk);
        await new Promise(resolve => setTimeout(resolve,25));
      }
    };
    const context = canvas.getContext('2d'); if (!context) throw new Error('Slip image unavailable');
    const rgba = context.getImageData(0,0,canvas.width,canvas.height).data;
    await write(new Uint8Array([0x1b,0x40,0x1b,0x61,0]));
    for(let y=0;y<canvas.height;y+=32) await write(rasterBand(rgba,canvas.width,canvas.height,y,Math.min(32,canvas.height-y)));
    await write(new Uint8Array([0x0a,0x0a,0x0a]));
  } finally { if (device.gatt.connected) device.gatt.disconnect(); }
}
