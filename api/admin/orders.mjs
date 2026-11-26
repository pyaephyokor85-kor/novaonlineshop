import { processAdminRequest } from '../../lib/order-management.mjs';

import { costStudioDocument } from '../../lib/cost-studio-document.mjs';
import catalog from '../../data/nova-catalog.json' with { type: 'json' };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (new URL(req.url || '/', 'http://localhost').searchParams.get('view') === 'cost-studio') {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
    const session = await processAdminRequest(req, { resource: 'session' });
    if (!session.body.authorized) return res.status(session.status).json({ error: session.body.error || 'Admin access required' });
    const literal = value => JSON.stringify(value).replaceAll('<', '\\u003c');
    const html = costStudioDocument
      .replace('__NOVA_CATALOG__', () => literal(catalog.map(row => row.code + ' ' + row.name)))
      .replace('__NOVA_STORAGE_KEY__', () => literal('nova-cost-preview:' + session.body.email));
    return res.status(200).json({ html });
  }
  const result = await processAdminRequest(req, { resource: 'orders' });
  return res.status(result.status).json(result.body);
}
