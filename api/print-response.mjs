import { processThermerResponseRequest, THERMER_RESPONSE_HEADERS } from '../lib/thermer-print.mjs';

export default async function handler(req, res) {
  for (const [name, value] of Object.entries(THERMER_RESPONSE_HEADERS)) res.setHeader(name, value);
  const result = await processThermerResponseRequest(req);
  if (result.status === 405) res.setHeader('Allow', 'GET');
  return res.status(result.status).json(result.body);
}
