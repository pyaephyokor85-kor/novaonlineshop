import catalog from '../data/nova-catalog.json' with { type: 'json' };

const MAX_MESSAGE_LENGTH = 2000;
const MAX_PROFILE_ITEMS = 24;
const MAX_HISTORY_ITEMS = 50;
const MAX_CONVERSATION_ITEMS = 20;
const NOTE_NAMES = ['apple', 'ginger', 'sage', 'amberwood', 'saffron', 'amber', 'sandalwood', 'rose', 'white musk', 'vanilla', 'bergamot', 'neroli', 'cedar', 'black pepper', 'oud', 'vetiver'];
const NEGATIVE_WORDS = '(?:avoid|avoids|avoiding|dislike|dislikes|disliked|hate|hates|hated|cannot stand|can\\s+not\\s+stand|don\\s*[’\']?t like|do not like)';

const seasonContext = () => {
  const month = new Date().getMonth() + 1;
  if ([12, 1, 2].includes(month)) return { season: 'winter', label: 'warm, enveloping winter scents', families: ['amber', 'woody', 'oud'], notes: ['sandalwood', 'vanilla', 'amber'] };
  if ([3, 4, 5].includes(month)) return { season: 'spring', label: 'light floral spring scents', families: ['floral', 'musk', 'fresh'], notes: ['rose', 'white musk', 'neroli'] };
  if ([6, 7, 8].includes(month)) return { season: 'summer', label: 'bright, airy summer scents', families: ['citrus', 'fresh', 'floral'], notes: ['bergamot', 'neroli', 'cedar'] };
  return { season: 'autumn', label: 'polished, grounded autumn scents', families: ['amber', 'woody', 'leathery'], notes: ['amber', 'sandalwood', 'black pepper'] };
};

const asStrings = (value, limit = MAX_PROFILE_ITEMS) => Array.isArray(value)
  ? value.filter(item => typeof item === 'string').map(item => item.trim().toLowerCase()).filter(Boolean).slice(0, limit)
  : [];
const unique = values => [...new Set(values.filter(Boolean))].slice(0, MAX_PROFILE_ITEMS);
const safeProfile = profile => profile && typeof profile === 'object' && !Array.isArray(profile) ? profile : {};

function infer(message, inputProfile = {}) {
  const profile = safeProfile(inputProfile);
  const text = message.toLowerCase();
  const families = [...new Set(catalog.flatMap(p => Array.isArray(p.family) ? p.family : []))].filter(x => text.includes(String(x).toLowerCase()));
  const notes = NOTE_NAMES.filter(note => text.includes(note));
  // Apply negation to each named item, rather than marking every mentioned note disliked.
  const dislikedNotes = notes.filter(note => new RegExp(`${NEGATIVE_WORDS}\\s+(?:the\\s+)?${note.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(text));
  const dislikedFamilies = families.filter(family => new RegExp(`${NEGATIVE_WORDS}\\s+(?:the\\s+)?${family.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(text));
  const dislikes = unique([...asStrings(profile.dislikes), ...dislikedNotes, ...dislikedFamilies]);
  const dislikeSet = new Set(dislikes);
  return {
    favoriteFamilies: unique([...asStrings(profile.favoriteFamilies), ...families.filter(x => !dislikeSet.has(x))]),
    preferredNotes: unique([...asStrings(profile.preferredNotes), ...notes.filter(x => !dislikeSet.has(x))]),
    dislikes,
    moods: unique(asStrings(profile.moods)),
    occasions: unique(asStrings(profile.occasions)),
  };
}

function normalizePurchases(purchases) {
  if (!Array.isArray(purchases)) return [];
  return purchases.filter(item => item && typeof item === 'object').slice(0, MAX_HISTORY_ITEMS);
}

function normalizeConversation(history) {
  if (!Array.isArray(history)) return [];
  return history.filter(item => item && typeof item === 'object' && typeof item.text === 'string')
    .map(item => ({ role: item.from === 'nova' || item.role === 'assistant' ? 'assistant' : 'user', content: item.text.trim().slice(0, MAX_MESSAGE_LENGTH) }))
    .filter(item => item.content).slice(-MAX_CONVERSATION_ITEMS);
}

function rank(profile, purchases = []) {
  const season = seasonContext();
  const likes = [...asStrings(profile.favoriteFamilies), ...asStrings(profile.preferredNotes)];
  const dislikes = new Set(asStrings(profile.dislikes));
  const history = normalizePurchases(purchases);
  const purchasedFamilies = history.flatMap(item => catalog.find(p => p.id === String(item.productId || item.product_id))?.family || []);
  return catalog.map(product => {
    const matchedFamilies = product.family.filter(x => likes.includes(x));
    const matchedNotes = product.notes.filter(x => likes.includes(x));
    const seasonalMatches = [...product.family.filter(x => season.families.includes(x)), ...product.notes.filter(x => season.notes.includes(x))];
    const historyMatches = product.family.filter(x => purchasedFamilies.includes(x));
    const blocked = product.family.some(x => dislikes.has(x)) || product.notes.some(x => dislikes.has(x));
    const score = matchedFamilies.length * 4 + matchedNotes.length * 3 + seasonalMatches.length * 2 + historyMatches.length * 2;
    return { ...product, score, matchedFamilies, matchedNotes, seasonalMatches, purchaseMatches: history.filter(x => String(x.productId || x.product_id) === product.id).length, blocked };
  }).filter(product => !product.blocked).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3);
}

function fallbackReply(message, recommendations, season) {
  const top = recommendations[0];
  if (!top) return /[\u1000-\u109F]/.test(message)
    ? 'သင့်မကြိုက်တဲ့ note တွေကို ရှောင်ထားပြီး အကြံပြုနိုင်ရန် mood၊ note သို့မဟုတ် occasion ကို ထပ်ပြောပြပါ။'
    : 'Tell me more about the mood, notes, or occasion you have in mind so I can avoid scents you dislike.';
  const burmese = /[\u1000-\u109F]/.test(message);
  return burmese
    ? `${top.name} ကို အကြံပြုပါတယ်။ ${top.familyLabel} vibe နဲ့ ${top.notes.join(', ')} notes တွေကြောင့် သင့် preference နဲ့ ကိုက်ညီပါတယ်။ ${season.label} အတွက်လည်း သင့်တော်ပါတယ်။`
    : `${top.name} is the best match for you. Its ${top.family.join(' · ')} character and ${top.notes.join(', ')} notes fit your profile, with a ${season.label} direction.`;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  try {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body; } catch { return res.status(400).json({ error: 'Invalid JSON body' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'JSON object body required' });
    if (typeof body.message !== 'string' || !body.message.trim()) return res.status(400).json({ error: 'message is required' });
    const message = body.message.trim().slice(0, MAX_MESSAGE_LENGTH);
    const profile = infer(message, body.profile);
    const purchaseHistory = normalizePurchases(body.purchaseHistory);
    const conversationHistory = normalizeConversation(body.history);
    const recommendations = rank(profile, purchaseHistory);
    const season = seasonContext();
    let reply = fallbackReply(message, recommendations, season);
    let fallback = true;
    const key = process.env.OPENAI_API_KEY;
    const base = (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
    if (!key) {
      console.warn('[scent-advisor] OpenAI fallback', { category: 'missing_key', code: 'OPENAI_KEY_MISSING', status: null });
    }
    if (key && recommendations.length) {
      let status = null;
      try {
        const model = process.env.LLM_MODEL || 'gpt-5-mini';
        const ranked = recommendations.map((x, i) => `${i + 1}. ${x.name} | ${x.family.join(', ')} | ${x.notes.join(', ')} | ${x.price}`).join('\n');
        const payload = { model, max_completion_tokens: 500, messages: [{ role: 'system', content: `You are NOVA perfume advisor. Recommend only these non-blocked ranked products and reply in the user's language, under 100 words:\n${ranked}` }, ...conversationHistory, { role: 'user', content: message }] };
        // reasoning_effort is accepted by reasoning models, but omitting it keeps custom/general models compatible.
        if (/^gpt-5(?:-|$)/i.test(model)) payload.reasoning_effort = 'low';
        const r = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify(payload) });
        status = Number.isInteger(r.status) && r.status >= 100 && r.status <= 599 ? r.status : null;
        if (!r.ok) {
          console.warn('[scent-advisor] OpenAI fallback', { category: 'http_error', code: 'OPENAI_HTTP_ERROR', status });
        }
        const data = await r.json();
        if (r.ok && data.choices?.[0]?.message?.content) { reply = data.choices[0].message.content; fallback = false; }
        else if (r.ok) {
          console.warn('[scent-advisor] OpenAI fallback', { category: 'empty_response', code: 'OPENAI_CONTENT_MISSING', status });
        }
      } catch {
        // Never log the error object, response body, request payload, headers, or key.
        if (status === null) {
          console.warn('[scent-advisor] OpenAI fallback', { category: 'request_failure', code: 'OPENAI_REQUEST_FAILED', status: null });
        } else if (status < 400) {
          console.warn('[scent-advisor] OpenAI fallback', { category: 'response_failure', code: 'OPENAI_RESPONSE_INVALID', status });
        }
      }
    }
    return res.status(200).json({ reply, profile, recommendations, seasonalContext: season, purchaseHistoryCount: purchaseHistory.length, fallback });
  } catch (error) { return res.status(500).json({ error: error.message || 'Advisor unavailable' }); }
}

export { infer, rank, normalizePurchases };
