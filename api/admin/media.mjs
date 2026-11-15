import { processAdminRequest } from '../../lib/order-management.mjs';
export const config = { api: { bodyParser: { sizeLimit: '3mb' } } };
export default async function handler(req, res) {
  const result = await processAdminRequest(req, { resource: 'media' });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(result.status).json(result.body);
}
