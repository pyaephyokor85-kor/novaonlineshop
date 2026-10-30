import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/nova-catalog.json' with { type: 'json' };
import handler, { infer, rank } from '../api/scent-advisor.mjs';

const makeRes = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(value) { this.body = value; return value; },
  end() { this.ended = true; },
});

test('infer tolerates malformed profile arrays and keeps positive notes separate from dislikes', () => {
  const profile = infer('I like rose but hate oud', { favoriteFamilies: null, preferredNotes: {}, dislikes: 'oud', moods: [1, ''], occasions: null });
  assert.deepEqual(profile.preferredNotes, ['rose']);
  assert.deepEqual(profile.dislikes, ['oud']);
  assert.deepEqual(profile.moods, []);
});

test('rank never returns blocked products and safely ignores malformed history', () => {
  const recommendations = rank({ favoriteFamilies: [], preferredNotes: [], dislikes: ['oud'] }, [null, 'bad', { productId: 'NV-003' }]);
  assert.ok(recommendations.length > 0);
  assert.ok(recommendations.every(product => !product.blocked && !product.family.includes('oud') && !product.notes.includes('oud')));
});

test('handler returns a generic fallback when every catalog product is blocked', async () => {
  const blocked = [...new Set(catalog.flatMap(product => [...product.family, ...product.notes]))];
  const res = makeRes();
  const oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  await handler({ method: 'POST', body: { message: 'recommend something', profile: { dislikes: blocked } } }, res);
  if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.recommendations, []);
  assert.match(res.body.reply, /Tell me another scent preference/);
});

test('LLM request contains only nonblocked products and compatible reasoning option', async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, async json() { return { choices: [{ message: { content: JSON.stringify({ reply: 'Try this fresh scent.', recommendationIds: ['NV-003'] }) } }] }; } };
  };
  try {
    const res = makeRes();
    await handler({ method: 'POST', body: { message: 'I hate oud', history: [{ from: 'user', text: 'I want something warm' }, { from: 'nova', text: 'I can help' }, { from: 'user', text: 42 }] } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.fallback, false);
    assert.equal(request.reasoning_effort, 'low');
    assert.equal(request.reasoning, undefined);
    assert.ok(request.messages[0].content.includes('Eligible catalog'));
    assert.deepEqual(request.messages.slice(1, 3).map(message => message.content), ['I want something warm', 'I can help']);
    assert.ok(!request.messages[0].content.toLowerCase().includes('oud |'));
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = oldKey;
  }
});

test('malformed JSON and missing message are bounded 400 responses', async () => {
  const invalid = makeRes();
  await handler({ method: 'POST', body: '{' }, invalid);
  assert.equal(invalid.statusCode, 400);
  const missing = makeRes();
  await handler({ method: 'POST', body: { message: 123 } }, missing);
  assert.equal(missing.statusCode, 400);
});
