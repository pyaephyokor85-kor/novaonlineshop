import { processPublicDiscountRequest } from '../lib/order-management.mjs';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  const result = await processPublicDiscountRequest(req);
  return res.status(result.status).json(result.body);
}
