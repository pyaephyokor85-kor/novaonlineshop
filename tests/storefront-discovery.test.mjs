import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { storefrontCategory, filterStorefront, parseFavoriteIds } from '../lib/storefront-discovery.mjs';
const catalog = JSON.parse(await readFile(new URL('../data/nova-catalog.json', import.meta.url), 'utf8'));
const products = catalog.map(p => ({ ...p, family: p.familyLabel, notes: p.family.join(' · ') }));
test('category tabs partition the entire master catalog into 16 men, 12 women, 4 unisex', () => {
  const ids = [];
  for (const [category, count] of [['Men',16],['Women',12],['Unisex',4]]) {
    const result = filterStorefront(products, { category });
    assert.equal(result.length, count);
    assert.ok(result.every(p => storefrontCategory(p.category) === category));
    ids.push(...result.map(p => p.id));
  }
  assert.equal(new Set(ids).size, 32);
  assert.equal(storefrontCategory("Men's Luxury Fragrance"), 'Men');
  assert.equal(storefrontCategory('women'), 'Women');
});
test('search accepts NV code variations and case-insensitive multiword names', () => {
  for (const query of ['NV-001','nv001','NV‑001','001','  blue   ESSENCE  ']) {
    assert.deepEqual(filterStorefront(products,{query}).map(p=>p.id), ['NV-001']);
  }
  assert.deepEqual(filterStorefront(products,{query:'midnight opium'}).map(p=>p.id), ['NV-002']);
  assert.equal(filterStorefront(products,{query:'no such scent'}).length, 0);
});
test('search, gender, family and saved filters intersect and do not leak wrong categories', () => {
  const options = { query:'blue', category:'Men', savedOnly:true, favoriteIds:['NV-001','NV-002'], family:'Woody' };
  assert.deepEqual(filterStorefront(products,options).map(p=>p.id), ['NV-001']);
  assert.deepEqual(filterStorefront(products,{...options,category:'Women'}), []);
  assert.deepEqual(filterStorefront(products,{savedOnly:true}), []);
  assert.equal(filterStorefront(products,{}).length,32);
});
test('saved IDs recover safely from corrupt storage and discard duplicates or unknown codes', () => {
  const allowed = products.map(p=>p.id);
  for (const stored of ['bad-json','null','{}','42','']) assert.deepEqual(parseFavoriteIds(stored,allowed),[]);
  assert.deepEqual(parseFavoriteIds('["NV-001","NV-001","NV-002","NV-999",null,7]',allowed), ['NV-001','NV-002']);
});
