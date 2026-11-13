import { processAdminRequest } from '../../lib/order-management.mjs';
export default async function handler(req, res) {
  const result = await processAdminRequest(req, { resource: 'session' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(result.status).json(result.body);
}
