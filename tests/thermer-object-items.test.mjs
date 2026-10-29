import test from 'node:test';
import assert from 'node:assert/strict';
import { buildThermerReceiptData } from '../lib/print-templates.mjs';
import { previewFakeReceipt } from './fixtures/preview-fake-receipt.mjs';

const item = previewFakeReceipt.nova_order_items[0];

test('accepts a valid object-shaped nova_order_items relationship', () => {
  const data = buildThermerReceiptData({ ...previewFakeReceipt, nova_order_items: { ...item } });
  const text = Object.values(data).map(line => line.content).join('\n');
  assert.match(text, /Blue Essence/);
  assert.match(text, /NV-001 \/ 10ml x 1/);
  assert.match(text, /Line: 15,000 Ks/);
  assert.match(text, /COD total: 13,500 Ks/);
});

test('continues to accept the existing array-shaped relationship', () => {
  assert.doesNotThrow(() => buildThermerReceiptData(previewFakeReceipt));
});

test('still validates each item after normalizing an object', () => {
  assert.throws(
    () => buildThermerReceiptData({ ...previewFakeReceipt, nova_order_items: { ...item, line_total: 1 } }),
    /A valid saved receipt item is required\./,
  );
});
