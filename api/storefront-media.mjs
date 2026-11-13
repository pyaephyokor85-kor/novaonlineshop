import { publicMedia } from '../lib/storefront-media.mjs';
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
  res.setHeader('Cache-Control', 'no-store');
  const result = await publicMedia();
  return res.status(result.status).json(result.body);
}
