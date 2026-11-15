// n8n Code node: "Parse Triage" (mode: run once for each item)
// Reads Gemini's answer, checks it against the schema, and falls back to
// "needs human review" if the call failed or the JSON is missing/invalid.

const CATEGORIES = ['buyer', 'renter', 'seller', 'agent', 'spam', 'other'];
const URGENCIES = ['high', 'medium', 'low'];

const FALLBACK = {
  category: 'other',
  urgency: 'low',
  summary: '',
  property_mentioned: null,
  draft_reply: '',
  needs_human: true,
};

// The original inquiry fields, without the request we sent to Gemini.
const { gemini_request, ...inquiry } = $('Build Request').item.json;

let triage = FALLBACK;
let triage_error = '';

try {
  if ($json.error) {
    const detail = typeof $json.error === 'string' ? $json.error : JSON.stringify($json.error);
    throw new Error(`Gemini call failed: ${detail.slice(0, 200)}`);
  }

  const text = $json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text');

  const out = JSON.parse(text);
  const category = String(out.category ?? '').toLowerCase();
  const urgency = String(out.urgency ?? '').toLowerCase();

  if (!CATEGORIES.includes(category)) throw new Error(`Invalid category: ${out.category}`);
  if (!URGENCIES.includes(urgency)) throw new Error(`Invalid urgency: ${out.urgency}`);
  if (typeof out.needs_human !== 'boolean') throw new Error('needs_human is not true/false');

  triage = {
    category,
    urgency,
    summary: String(out.summary ?? ''),
    property_mentioned: out.property_mentioned ? String(out.property_mentioned) : null,
    draft_reply: String(out.draft_reply ?? ''),
    needs_human: out.needs_human,
  };
} catch (e) {
  triage_error = e.message;
}

return {
  json: {
    ...inquiry,
    ...triage,
    triage_error,
    model: $json.modelVersion ?? '',
  },
};
