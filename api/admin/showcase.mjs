import { processAdminRequest } from '../../lib/order-management.mjs';
export default async function handler(req, res) {
  const result = await processAdminRequest(req, { resource: 'showcase' });
  return res.status(result.status).json(result.body);
}
