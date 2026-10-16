import catalog from '../data/nova-catalog.json' with { type: 'json' };

const seasonContext = () => {
  const month = new Date().getMonth() + 1;
  if ([12, 1, 2].includes(month)) return { season: 'winter', label: 'warm, enveloping winter scents', families: ['amber', 'woody', 'oud'], notes: ['sandalwood', 'vanilla', 'amber'] };
  if ([3, 4, 5].includes(month)) return { season: 'spring', label: 'light floral spring scents', families: ['floral', 'musk', 'fresh'], notes: ['rose', 'white musk', 'neroli'] };
  if ([6, 7, 8].includes(month)) return { season: 'summer', label: 'bright, airy summer scents', families: ['citrus', 'fresh', 'floral'], notes: ['bergamot', 'neroli', 'cedar'] };
  return { season: 'autumn', label: 'polished, grounded autumn scents', families: ['amber', 'woody', 'leathery'], notes: ['amber', 'sandalwood', 'black pepper'] };
};
const unique = values => [...new Set(values.filter(Boolean))].slice(0, 12);
function infer(message, profile = {}) {
  const text = message.toLowerCase();
  const families = [...new Set(catalog.flatMap(p => p.family))].filter(x => text.includes(x));
  const notes = ['apple','ginger','sage','amberwood','saffron','amber','sandalwood','rose','white musk','vanilla','bergamot','neroli','cedar','black pepper','oud','vetiver'].filter(x => text.includes(x));
  const dislikes = ['avoid','dislike','hate',"don't like"].some(x => text.includes(x)) ? notes : [];
  return { favoriteFamilies: unique([...(profile.favoriteFamilies || []), ...families.filter(x => !dislikes.includes(x))]), preferredNotes: unique([...(profile.preferredNotes || []), ...notes.filter(x => !dislikes.includes(x))]), dislikes: unique([...(profile.dislikes || []), ...dislikes]), moods: profile.moods || [], occasions: profile.occasions || [] };
}
function rank(profile, purchases = []) {
  const season = seasonContext();
  const likes = [...profile.favoriteFamilies, ...profile.preferredNotes].map(x => x.toLowerCase());
  const dislikes = (profile.dislikes || []).map(x => x.toLowerCase());
  const purchasedFamilies = purchases.flatMap(item => catalog.find(p => p.id === String(item.productId || item.product_id))?.family || []);
  return catalog.map(product => {
    const matchedFamilies = product.family.filter(x => likes.includes(x));
    const matchedNotes = product.notes.filter(x => likes.includes(x));
    const seasonalMatches = [...product.family.filter(x => season.families.includes(x)), ...product.notes.filter(x => season.notes.includes(x))];
    const historyMatches = product.family.filter(x => purchasedFamilies.includes(x));
    const blocked = product.family.some(x => dislikes.includes(x)) || product.notes.some(x => dislikes.includes(x));
    const score = matchedFamilies.length * 4 + matchedNotes.length * 3 + seasonalMatches.length * 2 + historyMatches.length * 2 - (blocked ? 100 : 0);
    return { ...product, score, matchedFamilies, matchedNotes, seasonalMatches, purchaseMatches: purchases.filter(x => String(x.productId || x.product_id) === product.id).length, blocked };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3);
}
function fallbackReply(message, recommendations, season) {
  const top = recommendations.find(x => !x.blocked) || recommendations[0];
  if (!top) return 'Tell me more about the mood, notes, or occasion you have in mind.';
  const burmese = /[\u1000-\u109F]/.test(message);
  return burmese
    ? `${top.name} ကို အကြံပြုပါတယ်။ ${top.familyLabel} vibe နဲ့ ${top.notes.join(', ')} notes တွေကြောင့် သင့် preference နဲ့ ကိုက်ညီပါတယ်။ ${season.label} အတွက်လည်း သင့်တော်ပါတယ်။`
    : `${top.name} is the best match for you. Its ${top.family.join(' · ')} character and ${top.notes.join(', ')} notes fit your profile, with a ${season.label} direction.`;
}
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!body.message?.trim()) return res.status(400).json({ error: 'message is required' });
    const profile = infer(body.message.trim(), body.profile || {});
    const recommendations = rank(profile, Array.isArray(body.purchaseHistory) ? body.purchaseHistory : []);
    const season = seasonContext();
    let reply = fallbackReply(body.message.trim(), recommendations, season);
    let fallback = true;
    const key = process.env.OPENAI_API_KEY;
    const base = (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/$/, '');
    if (key) {
      try {
        const ranked = recommendations.map((x, i) => `${i + 1}. ${x.name} | ${x.family.join(', ')} | ${x.notes.join(', ')} | ${x.price}`).join('\n');
        const r = await fetch(`${base}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model: process.env.LLM_MODEL || 'gpt-5-mini', max_completion_tokens: 500, reasoning: { effort: 'low' }, messages: [{ role: 'system', content: `You are NOVA perfume advisor. Recommend only these ranked products and reply in the user's language, under 100 words:\n${ranked}` }, { role: 'user', content: body.message.trim() }] }) });
        const data = await r.json();
        if (r.ok && data.choices?.[0]?.message?.content) { reply = data.choices[0].message.content; fallback = false; }
      } catch {}
    }
    return res.status(200).json({ reply, profile, recommendations, seasonalContext: season, purchaseHistoryCount: Array.isArray(body.purchaseHistory) ? body.purchaseHistory.length : 0, fallback });
  } catch (error) { return res.status(500).json({ error: error.message || 'Advisor unavailable' }); }
}
