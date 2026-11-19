import { processSamplePublic } from '../lib/sample-campaign.mjs';
import { publicMedia } from '../lib/storefront-media.mjs';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (new URL(req.url || '/', 'http://localhost').searchParams.get('view') === 'samples') { const result = await processSamplePublic(req); return res.status(result.status).json(result.body); }
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
  res.setHeader('Cache-Control', 'no-store');
  const result = await publicMedia();
  return res.status(result.status).json(result.body);
}
