// Read-only display snapshot of the existing fake Preview order, observed in /admin.
// Database UUID and exact stored timestamp were not read; tests add synthetic values where needed.
export const previewFakeReceipt = {
  order_number: 'NOVA-261027-9F8B1A',
  status: 'delivery',
  customer_name: 'FAKE QA 10ML - DO NOT SHIP',
  phone: '09000000000',
  payment_method: 'COD',
  subtotal: 15000,
  discount_percent: 10,
  discount_amount: 1500,
  total: 13500,
  nova_order_items: [{ product_id: 'NV-001', product_name: 'Blue Essence', size: '10ml', unit_price: 15000, quantity: 1, line_total: 15000 }],
};
