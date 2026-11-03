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
    s += 'Delivery fee not included.\nThank you for choosing NOVA\n';
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
