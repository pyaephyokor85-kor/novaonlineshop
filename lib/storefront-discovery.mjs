/** Normalize existing category labels without changing the master catalog. */
export function storefrontCategory(category = '') {
  const value = String(category).trim().toLowerCase();
  if (value === 'women') return 'Women';
  if (value === 'unisex') return 'Unisex';
  if (value === 'men' || value.startsWith("men's")) return 'Men';
  return '';
}
const normalize = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[‐‑‒–—−]/g, '-').replace(/\s+/g, ' ').trim();
/** Search terms are combined, and category/family/saved filters always intersect. */
export function filterStorefront(products, { query = '', category = 'All', family = 'All', savedOnly = false, favoriteIds = [] } = {}) {
  const terms = normalize(query).split(' ').filter(Boolean);
  const saved = new Set(favoriteIds);
  return products.filter(product => {
    if (category !== 'All' && storefrontCategory(product.category) !== category) return false;
    if (savedOnly && !saved.has(product.id)) return false;
    if (family !== 'All' && !normalize(product.family).includes(normalize(family))) return false;
    const text = normalize([product.id, product.name, product.family, product.notes, storefrontCategory(product.category)].join(' '));
    const compactCode = normalize(product.id).replace(/[^a-z0-9]/g, '');
    return terms.every(term => text.includes(term) || (/^(?:nv-?)?\d{3}$/.test(term) && compactCode.includes(term.replace('-', ''))));
  });
}
export function parseFavoriteIds(stored, allowedIds) {
  try {
    const values = JSON.parse(stored || '[]');
    if (!Array.isArray(values)) return [];
    const allowed = new Set(allowedIds);
    return [...new Set(values.filter(value => typeof value === 'string' && allowed.has(value)))];
  } catch { return []; }
}
