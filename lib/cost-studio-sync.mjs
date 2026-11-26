export async function costStudioSync(req, { baseUrl, serviceKey, email, fetchImpl }) {
  const headers = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };
  const table = baseUrl + '/rest/v1/nova_cost_studio_preview';
  const owner = '?owner_email=eq.' + encodeURIComponent(email);
  const read = req.method === 'GET';
  const { revision, ledger } = req.body || {};
  if (!read && (!Number.isSafeInteger(revision) || revision < 0 || !ledger ||
      !Array.isArray(ledger.entries) || !ledger.entries.every(row => row && typeof row.id === 'string' && ['formula','expense'].includes(row.kind)) ||
      !Array.isArray(ledger.refs) || ledger.refs.length !== 6 || !ledger.refs.every(n => Number.isFinite(n) && n >= 0) ||
      !ledger.checks || typeof ledger.checks !== 'object' || Array.isArray(ledger.checks))) {
    return { status: 400, body: { error: 'Invalid Cost Studio snapshot' } };
  }
  const create = !read && revision === 0;
  const url = read ? table + owner + '&select=revision,ledger' : create ? table : table + owner + '&revision=eq.' + revision;
  const write = read ? {} : { body: JSON.stringify({ ...(create ? { owner_email: email } : {}), revision: revision + 1, ledger }) };
  const response = await fetchImpl(url, { method: read ? 'GET' : create ? 'POST' : 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, ...write });
  if (response.status === 409) return { status: 409, body: { error: 'အခြားစက်က သိမ်းထားပါတယ်။ Sync ပြန်နှိပ်ပါ။' } };
  if (!response.ok) return { status: 503, body: { error: 'Preview database ချိတ်ဆက်မှု မရသေးပါ။ ဖုန်းထဲက စာရင်းကို ဆက်သုံးနိုင်ပါတယ်။' } };
  const [row] = await response.json();
  if (!read && !row) return { status: 409, body: { error: 'အခြားစက်က သိမ်းထားပါတယ်။ Sync ပြန်နှိပ်ပါ။' } };
  return { status: 200, body: row ? { revision: row.revision, ...(read ? { ledger: row.ledger } : {}) } : { revision: 0, ledger: null } };
}
