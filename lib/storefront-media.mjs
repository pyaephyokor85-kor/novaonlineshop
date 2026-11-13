import { randomUUID } from 'node:crypto';
const table = 'nova_storefront_media';
const bucket = 'nova-storefront-media';
const idPattern = /^(?:slide-[a-zA-Z0-9-]{1,80}|NV-00[1-9]|NV-0[12][0-9]|NV-03[0-2])$/;
async function read(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Media storage unavailable. Apply the storefront media migration to the Preview database.');
  return data;
}
export async function processMedia(req, { baseUrl, serviceKey, fetchImpl = fetch, email }) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
  if (req.method === 'GET') {
    const rows = await read(await fetchImpl(`${baseUrl}/rest/v1/${table}?select=*&order=sort_order.asc,id.asc`, { headers }));
    return { status: 200, body: { media: rows } };
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  if (!idPattern.test(body.id || '') || !['save', 'delete', 'upload'].includes(body.action)) return { status: 400, body: { error: 'Invalid media action or product code.' } };
  const kind = body.id.startsWith('NV-') ? 'product' : 'slide';
  if (body.action === 'upload') {
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(body.dataUrl || '');
    if (!match || match[2].length > 2800000) return { status: 400, body: { error: 'Use a PNG, JPEG or WebP image under 2 MB.' } };
    const bytes = Buffer.from(match[2], 'base64');
    const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid || bytes.length > 2 * 1024 * 1024) return { status: 400, body: { error: 'Invalid image file.' } };
    const object = `${body.id}/${randomUUID()}.${match[1] === 'jpeg' ? 'jpg' : match[1]}`;
    await read(await fetchImpl(`${baseUrl}/storage/v1/object/${bucket}/${object}`, { method: 'POST', headers: { ...headers, 'Content-Type': `image/${match[1]}` }, body: bytes }));
    return { status: 200, body: { image_url: `${baseUrl}/storage/v1/object/public/${bucket}/${object}` } };
  }
  const deleting = body.action === 'delete';
  const image = deleting ? null : String(body.image_url || '').trim();
  const prefix = `${baseUrl}/storage/v1/object/public/${bucket}/${body.id}/`;
  if (image && (!image.startsWith(prefix) || image.length > 1000 || /[\s<>]/.test(image))) return { status: 400, body: { error: 'Upload the image before saving.' } };
  if (!deleting && (typeof body.enabled !== 'boolean' || !['discover', 'advisor'].includes(body.cta) || String(body.title || '').length > 90 || String(body.description || '').length > 500 || (!image || (kind === 'slide' && !String(body.title || '').trim())))) return { status: 400, body: { error: 'Add a slide title and image; check the fields.' } };
  const row = { id: body.id, kind, title: deleting ? '' : String(body.title || '').trim(), description: deleting ? '' : String(body.description || '').trim(), image_url: image || null, enabled: !deleting && body.enabled, deleted: deleting, cta: body.cta === 'advisor' ? 'advisor' : 'discover', sort_order: Number.isInteger(body.sort_order) ? Math.max(0, Math.min(999, body.sort_order)) : 0, updated_by: email, updated_at: new Date().toISOString() };
  const saved = await read(await fetchImpl(`${baseUrl}/rest/v1/${table}?on_conflict=id`, { method: 'POST', headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(row) }));
  return { status: 200, body: { media: saved[0] } };
}
export async function publicMedia({ env = process.env, fetchImpl = fetch } = {}) {
  const base = String(env.EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL || env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.NOVA_PREVIEW_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (env.NOVA_ORDER_STORAGE_ENABLED !== 'true' || !base || !key) return { status: 503, body: { error: 'Media storage is not configured.' } };
  try {
    const media = await read(await fetchImpl(`${base}/rest/v1/${table}?select=id,kind,title,description,image_url,enabled,deleted,cta,sort_order&order=sort_order.asc,id.asc`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }));
    return { status: 200, body: { media: media.filter(row => row.kind === 'product' || (row.enabled && !row.deleted)) } };
  } catch (error) { return { status: 503, body: { error: error.message } }; }
}
