import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.PORT || 8787);
const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
const model = process.env.LLM_MODEL || (provider === 'anthropic' ? 'claude-3-5-haiku-latest' : 'gpt-5-mini');
const dataDir = path.resolve('data');
const profileFile = (id) => path.join(dataDir, `${String(id).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
const emptyProfile = { favoriteFamilies: [], preferredNotes: [], moods: [], occasions: [], dislikes: [] };
const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
fs.mkdirSync(dataDir, { recursive: true });
const catalogProducts = JSON.parse(fs.readFileSync(path.resolve('data/nova-catalog.json'), 'utf8'));
const catalog = catalogProducts.map(p => `${p.code} | ${p.name} | ${p.familyLabel} | ${p.originalReference} | ${p.category} | ${p.bioMyanmar || 'description pending'}`).join('\n');
const catalogFamilies = [...new Set(catalogProducts.flatMap(p => p.family))];

function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS' }); res.end(JSON.stringify(body)); }
function readBody(req) { return new Promise((resolve, reject) => { let raw = ''; req.on('data', chunk => { raw += chunk; if (raw.length > 100_000) reject(new Error('Payload too large')); }); req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function bearer(req) { const value = req.headers.authorization || ''; return value.startsWith('Bearer ') ? value.slice(7).trim() : ''; }
async function authenticatedSupabaseUser(req) {
  const token = bearer(req);
  if (!supabaseUrl || !supabaseKey) return { error: 'Supabase server configuration is missing', status: 503 };
  if (!token) return { error: 'Authorization bearer token is required', status: 401 };
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.id) return { error: 'Invalid or expired Supabase session', status: 401 };
  return { token, user: data };
}
function cloudRow(userId, profile) { return { user_id: userId, favorite_families: profile.favoriteFamilies || [], preferred_notes: profile.preferredNotes || [], moods: profile.moods || [], occasions: profile.occasions || [], dislikes: profile.dislikes || [], last_recommendation: profile.lastRecommendation || null }; }
function cloudProfile(row) { return { favoriteFamilies: row.favorite_families || [], preferredNotes: row.preferred_notes || [], moods: row.moods || [], occasions: row.occasions || [], dislikes: row.dislikes || [], lastRecommendation: row.last_recommendation || undefined, updatedAt: row.updated_at || undefined }; }
async function readCloudProfile(req) {
  const auth = await authenticatedSupabaseUser(req); if (auth.error) return auth;
  const url = `${supabaseUrl}/rest/v1/fragrance_profiles?select=*&user_id=eq.${encodeURIComponent(auth.user.id)}`;
  const r = await fetch(url, { headers: { apikey: supabaseKey, Authorization: `Bearer ${auth.token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { error: data.message || 'Supabase profile read failed', status: r.status };
  return { user: auth.user, profile: data[0] ? cloudProfile(data[0]) : emptyProfile };
}
async function writeCloudProfile(req, profile) {
  const auth = await authenticatedSupabaseUser(req); if (auth.error) return auth;
  const r = await fetch(`${supabaseUrl}/rest/v1/fragrance_profiles?on_conflict=user_id`, { method: 'POST', headers: { apikey: supabaseKey, Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(cloudRow(auth.user.id, profile)) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { error: data.message || 'Supabase profile write failed', status: r.status };
  return { user: auth.user, profile: data[0] ? cloudProfile(data[0]) : profile };
}
function readProfile(id) { try { return { ...emptyProfile, ...JSON.parse(fs.readFileSync(profileFile(id), 'utf8')) }; } catch { return { ...emptyProfile }; } }
function saveProfile(id, profile) { fs.writeFileSync(profileFile(id), JSON.stringify({ ...profile, updatedAt: new Date().toISOString() }, null, 2)); }
function unique(values) { return [...new Set(values.filter(Boolean))].slice(0, 12); }
function seasonContext(date = new Date()) {
  const month = date.getMonth() + 1;
  if ([12, 1, 2].includes(month)) return { season: 'winter', label: 'warm, enveloping winter scents', families: ['amber', 'woody', 'oud'], notes: ['sandalwood', 'vanilla', 'amber'] };
  if ([3, 4, 5].includes(month)) return { season: 'spring', label: 'light floral spring scents', families: ['floral', 'musk', 'fresh'], notes: ['rose', 'white musk', 'neroli'] };
  if ([6, 7, 8].includes(month)) return { season: 'summer', label: 'bright, airy summer scents', families: ['citrus', 'fresh', 'floral'], notes: ['bergamot', 'neroli', 'cedar'] };
  return { season: 'autumn', label: 'polished, grounded autumn scents', families: ['amber', 'woody', 'leathery'], notes: ['amber', 'sandalwood', 'black pepper'] };
}
function rankProducts(profile, purchaseHistory = [], date = new Date()) {
  const likes = [...profile.favoriteFamilies, ...profile.preferredNotes].map(x => x.toLowerCase());
  const dislikes = profile.dislikes.map(x => x.toLowerCase());
  const season = seasonContext(date);
  return catalogProducts.map(product => {
    const familyMatches = product.family.filter(x => likes.includes(x)).length;
    const noteMatches = product.notes.filter(x => likes.includes(x)).length;
    const seasonalFamilies = product.family.filter(x => season.families.includes(x));
    const seasonalNotes = product.notes.filter(x => season.notes.includes(x));
    const productPurchases = purchaseHistory.filter(item => String(item.productId || item.product_id) === product.id);
    const purchasedFamilies = purchaseHistory.flatMap(item => catalogProducts.find(previous => previous.id === String(item.productId || item.product_id))?.family || []);
    const historyFamilies = product.family.filter(x => purchasedFamilies.includes(x));
    const recentPurchase = productPurchases.some(item => item.purchasedAt || item.purchased_at ? (Date.now() - new Date(item.purchasedAt || item.purchased_at).getTime()) < 180 * 86400000 : false);
    const blocked = product.family.some(x => dislikes.includes(x)) || product.notes.some(x => dislikes.includes(x));
    const score = (familyMatches * 4) + (noteMatches * 3) + (seasonalFamilies.length * 2) + seasonalNotes.length + (historyFamilies.length * 2) + (productPurchases.length * 2) + (recentPurchase ? 1 : 0) - (blocked ? 100 : 0);
    return { ...product, score, matchedFamilies: product.family.filter(x => likes.includes(x)), matchedNotes: product.notes.filter(x => likes.includes(x)), seasonalMatches: [...seasonalFamilies, ...seasonalNotes], purchaseMatches: productPurchases.length, blocked };
  }).sort((a, b) => b.score - a.score || Number(a.id) - Number(b.id)).slice(0, 3);
}
function inferProfile(message, current) {
  const text = message.toLowerCase();
  const dislikedWords = [...new Set([...catalogFamilies, 'saffron', 'amber', 'sandalwood', 'rose', 'musk', 'vanilla', 'bergamot', 'neroli', 'cedar', 'pepper', 'oud', 'vetiver'])];
  const dislikes = dislikedWords.filter(x => (text.includes('avoid') || text.includes('dislike') || text.includes('hate') || text.includes("don't like")) && text.includes(x));
  const families = catalogFamilies.filter(x => text.includes(x) && !dislikes.includes(x));
  const notes = ['saffron', 'amber', 'sandalwood', 'rose', 'white musk', 'vanilla', 'bergamot', 'neroli', 'cedar', 'black pepper', 'oud', 'vetiver'].filter(x => text.includes(x) && !dislikes.includes(x));
  const moods = ['fresh', 'clean', 'confident', 'cozy', 'mysterious', 'romantic', 'calm', 'bold', 'elegant', 'playful'].filter(x => text.includes(x));
  const occasions = ['daytime', 'day', 'night', 'date', 'office', 'work', 'wedding', 'travel', 'everyday'].filter(x => text.includes(x));
  return { ...current, favoriteFamilies: unique([...current.favoriteFamilies.filter(x => !dislikes.includes(x)), ...families]), preferredNotes: unique([...current.preferredNotes.filter(x => !dislikes.includes(x)), ...notes]), moods: unique([...current.moods, ...moods]), occasions: unique([...current.occasions, ...occasions]), dislikes: unique([...current.dislikes, ...dislikes]) };
}
async function askLLM(message, history = [], profile = emptyProfile, recommendations = [], season = seasonContext(), purchaseHistory = []) {
  const ranked = recommendations.map((x, index) => `${index + 1}. ${x.name} | ${x.family.join(' · ')} | ${x.notes.join(', ')} | ${x.price} | score ${x.score} | profile matches ${[...x.matchedFamilies, ...x.matchedNotes].join(', ') || 'none'} | seasonal matches ${x.seasonalMatches.join(', ') || 'none'} | previous purchases ${x.purchaseMatches}${x.blocked ? ' | BLOCKED BY DISLIKE' : ''}`).join('\n');
  const system = `You are NOVA, a refined and warm perfume scent advisor with persistent customer memory. Recommend only from this catalog:\n${catalog}\nCustomer profile (use it naturally, never expose raw JSON): ${JSON.stringify(profile)}\nCurrent seasonal context: ${season.season} — ${season.label}. Seasonal trend families: ${season.families.join(', ')}. Seasonal trend notes: ${season.notes.join(', ')}.\nPurchase history contains ${purchaseHistory.length} recorded item(s). Use previous purchases as evidence of taste and offer a refill or a complementary alternative when appropriate.\nThe deterministic matcher ranked these candidates:\n${ranked}\nUse the highest-ranked non-blocked candidates first. Never recommend a BLOCKED candidate. Mention seasonal or past-purchase reasoning naturally when relevant. Ask one thoughtful follow-up when the mood is unclear. Explain top, heart, and base notes when useful. Never invent products, prices, medical claims, or availability. Keep responses under 120 words, sensory and specific. The user may speak Burmese or English; reply in the user's language.`;
  const messages = history.filter(x => x.from === 'user' || x.from === 'nova').map(x => ({ role: x.from === 'nova' ? 'assistant' : 'user', content: x.text }));
  if (provider === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error('ANTHROPIC_API_KEY is not configured');
    const base = (process.env.ANTHROPIC_API_BASE || 'https://api.anthropic.com').replace(/\/$/, '');
    const r = await fetch(`${base}/v1/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model, max_tokens: 350, system, messages: [...messages, { role: 'user', content: message }] }) });
    const data = await r.json(); if (!r.ok) throw new Error(data.error?.message || 'Anthropic request failed'); return data.content?.map(x => x.text || '').join('') || 'Tell me a little more about your mood.';
  }
  const key = process.env.OPENAI_API_KEY; if (!key) throw new Error('OPENAI_API_KEY is not configured');
  const base = (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
  const r = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model, max_completion_tokens: 1200, reasoning: { effort: 'low' }, messages: [{ role: 'system', content: system }, ...messages, { role: 'user', content: message }] }) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error?.message || 'OpenAI request failed'); return data.choices?.[0]?.message?.content || 'Tell me a little more about your mood.';
}
function fallbackReply(message, recommendations = [], season = seasonContext()) {
  const top = recommendations.find(x => !x.blocked) || recommendations[0];
  if (!top) return 'Tell me a little more about the mood, notes, or occasion you have in mind.';
  const burmese = /[\u1000-\u109F]/.test(message);
  if (burmese) return `${top.name} ကို အကြံပြုပါတယ်။ ${top.familyLabel || top.family.join(' · ')} vibe နဲ့ ${top.notes.join(', ')} notes တွေကြောင့် သင့် preference နဲ့ ကိုက်ညီပါတယ်။ ${season.label} အတွက်လည်း သင့်တော်ပြီး Office၊ Date သို့မဟုတ် နေ့စဉ်သုံးအတွက် စမ်းကြည့်နိုင်ပါတယ်။`;
  return `${top.name} is my best match for you. Its ${top.family.join(' · ')} character and ${top.notes.join(', ')} notes fit your profile, with a ${season.label} direction. It is a versatile choice for your requested occasion.`;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, provider, model, memory: 'file-backed', supabase: Boolean(supabaseUrl && supabaseKey), catalogSize: catalogProducts.length });
  if (req.url === '/api/cloud-profile' && req.method === 'GET') { try { const result = await readCloudProfile(req); return json(res, result.error ? result.status : 200, result.error ? { error: result.error } : { profile: result.profile, user: { id: result.user.id, email: result.user.email } }); } catch (e) { return json(res, 502, { error: e.message }); } }
  if (req.url === '/api/cloud-profile' && (req.method === 'POST' || req.method === 'PUT')) { try { const body = await readBody(req); const result = await writeCloudProfile(req, body.profile || {}); return json(res, result.error ? result.status : 200, result.error ? { error: result.error } : { profile: result.profile, user: { id: result.user.id, email: result.user.email } }); } catch (e) { return json(res, 502, { error: e.message }); } }
  const match = req.url?.match(/^\/api\/profile\/([a-zA-Z0-9_-]+)$/);
  if (match && req.method === 'GET') return json(res, 200, { profile: readProfile(match[1]) });
  if (match && req.method === 'POST') { try { const body = await readBody(req); const profile = { ...readProfile(match[1]), ...(body.profile || {}) }; saveProfile(match[1], profile); return json(res, 200, { profile }); } catch (e) { return json(res, 400, { error: e.message }); } }
  if (req.url === '/api/cloud-purchases' && req.method === 'GET') { try { const auth = await authenticatedSupabaseUser(req); if (auth.error) return json(res, auth.status, { error: auth.error }); const r = await fetch(`${supabaseUrl}/rest/v1/fragrance_purchases?select=product_id,purchased_at,quantity,price&order=purchased_at.desc`, { headers: { apikey: supabaseKey, Authorization: `Bearer ${auth.token}` } }); const data = await r.json().catch(() => ({})); return json(res, r.ok ? 200 : r.status, r.ok ? { purchases: data } : { error: data.message || 'Supabase purchase history read failed' }); } catch (e) { return json(res, 502, { error: e.message }); } }
  if (req.url === '/api/cloud-purchases' && req.method === 'POST') { try { const auth = await authenticatedSupabaseUser(req); if (auth.error) return json(res, auth.status, { error: auth.error }); const body = await readBody(req); const purchase = body.purchase || {}; if (!catalogProducts.some(x => x.id === String(purchase.productId || purchase.product_id))) return json(res, 400, { error: 'Unknown NOVA product' }); const row = { user_id: auth.user.id, product_id: String(purchase.productId || purchase.product_id), purchased_at: purchase.purchasedAt || purchase.purchased_at || new Date().toISOString(), quantity: Math.max(1, Number(purchase.quantity || 1)), price: purchase.price || null }; const r = await fetch(`${supabaseUrl}/rest/v1/fragrance_purchases`, { method: 'POST', headers: { apikey: supabaseKey, Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(row) }); const data = await r.json().catch(() => ({})); return json(res, r.ok ? 201 : r.status, r.ok ? { purchase: data[0] || row } : { error: data.message || 'Supabase purchase history write failed' }); } catch (e) { return json(res, 502, { error: e.message }); } }
  if (req.method !== 'POST' || req.url !== '/api/scent-advisor') return json(res, 404, { error: 'Not found' });
  try {
    const body = await readBody(req);
    if (typeof body.message !== 'string' || !body.message.trim()) return json(res, 400, { error: 'message is required' });
    if (typeof body.profileId !== 'string' || !body.profileId.trim()) return json(res, 400, { error: 'profileId is required' });
    const profile = inferProfile(body.message.trim(), { ...readProfile(body.profileId), ...(body.profile || {}) });
    const purchaseHistory = Array.isArray(body.purchaseHistory) ? body.purchaseHistory : (Array.isArray(profile.purchaseHistory) ? profile.purchaseHistory : []);
    const season = seasonContext();
    const recommendations = rankProducts(profile, purchaseHistory);
    let reply; let fallback = false;
    try { reply = await askLLM(body.message.trim(), Array.isArray(body.history) ? body.history : [], profile, recommendations, season, purchaseHistory); }
    catch (error) { console.error('LLM unavailable; using deterministic catalog fallback:', error); reply = fallbackReply(body.message.trim(), recommendations, season); fallback = true; }
    const updated = { ...profile, lastRecommendation: reply.slice(0, 160), purchaseHistory };
    saveProfile(body.profileId, updated);
    return json(res, 200, { reply, profile: updated, recommendations, seasonalContext: season, purchaseHistoryCount: purchaseHistory.length, provider, model, fallback });
  } catch (e) { console.error(e); return json(res, 502, { error: e instanceof Error ? e.message : 'LLM request failed' }); }
});
server.listen(port, '0.0.0.0', () => console.log(`NOVA AI server listening on http://0.0.0.0:${port} (${provider}/${model})`));
