export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET required' });
  const base = String(process.env.EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.NOVA_PREVIEW_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.NOVA_ORDER_STORAGE_ENABLED !== 'true' || !base || !key) return res.status(200).json({ board: null });
  try {
    const response = await fetch(`${base}/rest/v1/nova_showcase?select=title,description,image_url,cta,updated_at&enabled=eq.true&id=eq.1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) return res.status(503).json({ error: 'Showcase unavailable' });
    const rows = await response.json();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ board: rows[0] || null });
  } catch { return res.status(503).json({ error: 'Showcase unavailable' }); }
}
