import { randomUUID } from 'node:crypto';
const codePattern = /^NV-(?:00[1-9]|0[12][0-9]|03[0-2])$/;
export const campaignMonth = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yangon', year: 'numeric', month: '2-digit' }).format(now).replace('/', '-');
export function validMonth(value) { return typeof value === 'string' && /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(value); }
export function normalizeSamplePhone(value) {
  if (typeof value !== 'string' || !/^[+\d\s()-]{7,30}$/.test(value)) throw new Error('ဖုန်းနံပါတ် မှန်ကန်စွာ ဖြည့်ပေးပါ။');
  let phone = value.replace(/\D/g, '');
  if (phone.startsWith('959')) phone = '0' + phone.slice(2);
  if (phone.length < 7 || phone.length > 15) throw new Error('ဖုန်းနံပါတ် မှန်ကန်စွာ ဖြည့်ပေးပါ။');
  return phone;
}
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
export function validateCampaign(body) {
  if (!validMonth(body.month) || !Number.isInteger(body.revision) || body.revision < 0 || typeof body.enabled !== 'boolean') throw new Error('Campaign လနဲ့ အခြေအနေကို ပြန်စစ်ပေးပါ။');
  const title = text(body.settings?.title, 120), rules = text(body.settings?.rules, 4000);
  const codes = body.settings?.codes;
  const count = body.settings?.selectionCount;
  const capacity = body.settings?.capacity ?? null;
  if (!title || !rules || !Array.isArray(codes) || !codes.length || codes.length > 32 || codes.some(code => typeof code !== 'string' || !codePattern.test(code)) || new Set(codes).size !== codes.length || !Number.isInteger(count) || count < 1 || count > Math.min(10, codes.length) || (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 50000))) throw new Error('ခေါင်းစဉ်၊ စည်းကမ်း၊ NV Codes နဲ့ ရွေးရမယ့်အရေအတွက်ကို ဖြည့်ပေးပါ။');
  return { month: body.month, revision: body.revision, enabled: body.enabled, settings: { title, rules, codes, selectionCount: count, capacity } };
}
export function validateApplication(body) {
  const name = text(body.name, 120), address = text(body.address, 500);
  const phone = normalizeSamplePhone(body.phone);
  if (!validMonth(body.month) || !Number.isInteger(body.revision) || body.revision < 1 || !name || !address || body.acceptedRules !== true || !Array.isArray(body.codes) || !body.codes.length || body.codes.length > 10 || body.codes.some(code => typeof code !== 'string' || !codePattern.test(code)) || new Set(body.codes).size !== body.codes.length || typeof body.requestKey !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(body.requestKey)) throw new Error('အမည်၊ လိပ်စာ၊ NV Codes နဲ့ စည်းကမ်းလက်ခံမှုကို ပြန်စစ်ပေးပါ။');
  return { month: body.month, revision: body.revision, name, phone, address, codes: body.codes, requestKey: body.requestKey };
}
function config(env) {
  const base = String(env.EXPO_PUBLIC_NOVA_PREVIEW_SUPABASE_URL || env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.NOVA_PREVIEW_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (env.NOVA_ORDER_STORAGE_ENABLED !== 'true' || !base || !key) throw new Error('CAMPAIGN_UNAVAILABLE');
  return { base, key };
}
function db({ base, key }, fetchImpl) {
  return async (path, body) => {
    const response = await fetchImpl(`${base}/rest/v1/${path}`, { method: body ? 'POST' : 'GET', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = ['CAMPAIGN_CHANGED', 'CAMPAIGN_CLOSED', 'CAMPAIGN_FULL', 'ALREADY_APPLIED', 'INVALID_SELECTION', 'REQUEST_CONFLICT'].find(value => String(data.message || '').includes(value));
      throw new Error(code || 'CAMPAIGN_UNAVAILABLE');
    }
    return data;
  };
}
const messages = { CAMPAIGN_CHANGED: 'Campaign စည်းကမ်း ပြောင်းထားပါတယ်။ ပြန်ဖွင့်ပြီး ဖတ်ပေးပါ။', CAMPAIGN_CLOSED: 'ဒီလ Campaign လျှောက်လွှာ မဖွင့်ရသေးပါ သို့မဟုတ် ပိတ်ထားပါတယ်။', CAMPAIGN_FULL: 'ဒီလ Campaign အတွက် လျှောက်လွှာ ပြည့်သွားပါပြီ။', ALREADY_APPLIED: 'ဒီဖုန်းနံပါတ်နဲ့ ဒီလအတွက် လျှောက်ထားပြီးပါပြီ။', INVALID_SELECTION: 'Campaign မှာ ရွေးနိုင်တဲ့ NV Codes နဲ့ အရေအတွက်ကို ပြန်စစ်ပေးပါ။', REQUEST_CONFLICT: 'တောင်းဆိုချက် ပြောင်းသွားပါတယ်။ လျှောက်လွှာကို ပြန်ဖွင့်ပါ။', CAMPAIGN_UNAVAILABLE: 'Campaign စနစ်ကို လောလောဆယ် အသုံးမပြုနိုင်သေးပါ။ နောက်မှ ပြန်စမ်းပါ။' };
const failure = error => ({ status: error.message === 'CAMPAIGN_UNAVAILABLE' ? 503 : 409, body: { error: messages[error.message] || messages.CAMPAIGN_UNAVAILABLE } });
export async function processSamplePublic(req, { env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  if (!['GET', 'POST'].includes(req.method)) return { status: 405, body: { error: 'GET or POST required' } };
  let application;
  if (req.method === 'POST') {
    try { application = validateApplication(typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}); }
    catch (error) { return { status: 400, body: { error: error instanceof SyntaxError ? 'Invalid JSON' : error.message } }; }
  }
  try {
    const query = db(config(env), fetchImpl);
    if (req.method === 'GET') {
      const month = campaignMonth(now);
      const rows = await query(`nova_sample_campaigns?select=month,settings,revision&enabled=eq.true&month=eq.${month}`);
      return { status: 200, body: { campaign: rows[0] || null } };
    }
    if (application.month !== campaignMonth(now)) return failure(new Error('CAMPAIGN_CLOSED'));
    const result = await query('rpc/create_nova_sample_application', { p_id: randomUUID(), p_month: application.month, p_revision: application.revision, p_name: application.name, p_phone: application.phone, p_address: application.address, p_codes: application.codes, p_request_key: application.requestKey });
    return { status: 200, body: { ok: true, applicationId: result.id, status: result.status, duplicate: Boolean(result.duplicate) } };
  } catch (error) { return failure(error); }
}
export async function processSampleAdmin(req, { baseUrl, serviceKey, fetchImpl = fetch, email }) {
  const query = db({ base: baseUrl, key: serviceKey }, fetchImpl);
  try {
    if (req.method === 'GET') {
      const month = new URL(req.url || '/', 'http://localhost').searchParams.get('month') || campaignMonth();
      if (!validMonth(month)) return { status: 400, body: { error: 'Choose YYYY-MM' } };
      const [campaigns, applications] = await Promise.all([
        query(`nova_sample_campaigns?select=*&month=eq.${month}`),
        query(`nova_sample_applications?select=id,campaign_month,customer_name,phone,address,scent_codes,status,created_at,campaign_revision,campaign_snapshot&campaign_month=eq.${month}&order=created_at.desc&limit=200`),
      ]);
      return { status: 200, body: { campaign: campaigns[0] || null, applications } };
    }
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    if (body.action === 'campaign') {
      let campaign;
      try { campaign = validateCampaign(body); } catch (error) { return { status: 400, body: { error: error.message } }; }
      const saved = await query('rpc/save_nova_sample_campaign', { p_month: campaign.month, p_revision: campaign.revision, p_enabled: campaign.enabled, p_settings: campaign.settings, p_actor: email });
      return { status: 200, body: { campaign: saved } };
    }
    if (body.action === 'status' && /^[0-9a-f-]{36}$/i.test(body.id || '') && ['pending', 'approved', 'declined', 'shipped'].includes(body.status)) {
      const saved = await query('rpc/update_nova_sample_status', { p_id: body.id, p_status: body.status, p_actor: email });
      return { status: 200, body: { application: saved } };
    }
    return { status: 400, body: { error: 'Invalid campaign action' } };
  } catch (error) { return failure(error); }
}
