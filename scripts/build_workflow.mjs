// Builds workflows/triage.json from the prompt and Code-node files, so the
// logic stays readable in the repo instead of living only inside n8n.
//
//   node scripts/build_workflow.mjs
//   node scripts/build_workflow.mjs --out <file> --id <workflowId> --sheets-cred <id> [--gemini-cred <id>] [--gmail-cred <id>] [--alert-to <email>]
//
// The second form writes a copy for `n8n import:workflow` that overwrites the
// existing workflow and keeps its credentials attached. Credential IDs are
// references, not secrets, but the repo copy leaves them out.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, a, i, all) => (a.startsWith('--') ? [...pairs, [a.slice(2), all[i + 1]]] : pairs), []),
);

const GEMINI_MODEL = 'gemini-flash-latest';
// Used only when the main model fails (e.g. 503 "high demand" or a timeout).
const GEMINI_FALLBACK_MODEL = 'gemini-flash-lite-latest';

// HTTP Request node that calls Gemini's generateContent with the body from Build Request.
const geminiNode = ({ name, model, id, position, timeout, maxTries, onError }) => ({
  parameters: {
    method: 'POST',
    url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'googlePalmApi',
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify($('Build Request').item.json.gemini_request) }}",
    options: { timeout },
  },
  id,
  name,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position,
  retryOnFail: maxTries > 1,
  maxTries,
  waitBetweenTries: 1000,
  onError,
});
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1lF7IFxnXTz6ABypaBHfcWUZZUrpNimazLGtt6FofWvg/edit';

const systemPrompt = read('prompts/system_prompt.md').trim();
const buildRequestSrc = read('workflows/code/build_request.js');
const PLACEHOLDER = 'const SYSTEM_PROMPT = __SYSTEM_PROMPT__;';
if (!buildRequestSrc.includes(PLACEHOLDER)) throw new Error(`build_request.js is missing: ${PLACEHOLDER}`);
const buildRequest = buildRequestSrc.replace(PLACEHOLDER, () => `const SYSTEM_PROMPT = ${JSON.stringify(systemPrompt)};`);
const parseTriage = read('workflows/code/parse_triage.js');

// IF node whose condition is a single JavaScript expression that must be true.
const ifNode = (name, expr, position, id) => ({
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      conditions: [
        {
          id: `${id}-c`,
          leftValue: `={{ ${expr} }}`,
          rightValue: '',
          operator: { type: 'boolean', operation: 'true', singleValue: true },
        },
      ],
      combinator: 'and',
    },
    options: {},
  },
  id,
  name,
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position,
});

// Hot-lead email. Values come from Parse Triage and are HTML-escaped.
const T = "$('Parse Triage').item.json";
const HOT_LEAD_SUBJECT = `'🔥 Hot lead (' + ${T}.category + '): ' + (${T}.property_mentioned || ${T}.name || 'new inquiry')`;
const HOT_LEAD_BODY = `(() => {
  const t = ${T};
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const row = (k, v) => '<tr><td style="padding:4px 12px 4px 0;color:#666"><b>' + k + '</b></td><td style="padding:4px 0">' + esc(v) + '</td></tr>';
  return '<p><b>' + esc(t.summary) + '</b></p>'
    + '<table>' + row('Name', t.name) + row('Email', t.email) + row('Phone', t.phone) + row('Property', t.property_mentioned || t.property)
    + row('Category', t.category) + row('Urgency', t.urgency) + row('Received', t.received_at) + '</table>'
    + '<p><b>Message</b><br>' + esc(t.message).replace(/\\n/g, '<br>') + '</p>'
    + '<p><b>Suggested reply</b> (check before sending)<br>' + esc(t.draft_reply) + '</p>'
    + '<p><a href="${SHEET_URL}">Open inquiry log</a></p>';
})()`;

const field = (id, name, expr) => ({ id, name, value: `={{ ${expr} }}`, type: 'string' });
const clean = (key) => `($json.body.${key} ?? '').toString().trim()`;

const nodes = [
  {
    parameters: { httpMethod: 'POST', path: 'inquiry', responseMode: 'responseNode', options: {} },
    id: 'a1f0c0de-0001-4000-8000-000000000001',
    name: 'Inquiry Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [0, 0],
    webhookId: '5b6f3c1e-2d4a-4e8b-9c7d-1a2b3c4d5e6f',
  },
  {
    parameters: {
      assignments: {
        assignments: [
          field('f1', 'received_at', '$now.toISO()'),
          field('f2', 'name', clean('name')),
          field('f3', 'email', clean('email')),
          field('f4', 'phone', clean('phone')),
          field('f5', 'property', clean('property')),
          field('f6', 'message', clean('message')),
          field('f7', 'source', "$json.body.source ?? 'test'"),
        ],
      },
      options: {},
    },
    id: 'a1f0c0de-0002-4000-8000-000000000002',
    name: 'Clean Fields',
    type: 'n8n-nodes-base.set',
    typeVersion: 3.4,
    position: [220, 0],
  },
  {
    parameters: { mode: 'runOnceForEachItem', jsCode: buildRequest },
    id: 'a1f0c0de-0005-4000-8000-000000000005',
    name: 'Build Request',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [440, 0],
  },
  // Main model: 2 tries x 20s. On failure, the item goes out the error branch to the fallback.
  geminiNode({
    name: 'Classify with Gemini',
    model: GEMINI_MODEL,
    id: 'a1f0c0de-0006-4000-8000-000000000006',
    position: [660, 0],
    timeout: 20000,
    maxTries: 2,
    onError: 'continueErrorOutput',
  }),
  // Fallback model: 1 try x 25s. If this fails too, Parse Triage marks the inquiry for human review.
  geminiNode({
    name: 'Classify with Fallback Model',
    model: GEMINI_FALLBACK_MODEL,
    id: 'a1f0c0de-0012-4000-8000-000000000012',
    position: [880, 180],
    timeout: 25000,
    maxTries: 1,
    onError: 'continueRegularOutput',
  }),
  {
    parameters: { mode: 'runOnceForEachItem', jsCode: parseTriage },
    id: 'a1f0c0de-0007-4000-8000-000000000007',
    name: 'Parse Triage',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [1100, 0],
  },
  {
    parameters: {
      operation: 'append',
      documentId: { __rl: true, value: SHEET_URL, mode: 'url' },
      sheetName: { __rl: true, value: 'Inquiries', mode: 'name' },
      columns: { mappingMode: 'autoMapInputData', value: {}, matchingColumns: [], schema: [] },
      options: {},
    },
    id: 'a1f0c0de-0003-4000-8000-000000000003',
    name: 'Save to Sheet',
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.5,
    position: [1100, 0],
  },
  {
    parameters: {
      respondWith: 'json',
      responseBody:
        "={{ { ok: true, received_at: $('Parse Triage').item.json.received_at, category: $('Parse Triage').item.json.category, urgency: $('Parse Triage').item.json.urgency, summary: $('Parse Triage').item.json.summary, property_mentioned: $('Parse Triage').item.json.property_mentioned, draft_reply: $('Parse Triage').item.json.draft_reply, needs_human: $('Parse Triage').item.json.needs_human, triage_error: $('Parse Triage').item.json.triage_error } }}",
      options: {},
    },
    id: 'a1f0c0de-0004-4000-8000-000000000004',
    name: 'Respond',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [1320, 0],
  },
  ifNode('Is Spam?', '$json.category === \'spam\'', [1540, 0], 'a1f0c0de-0008-4000-8000-000000000008'),
  {
    parameters: {},
    id: 'a1f0c0de-0009-4000-8000-000000000009',
    name: 'Drop Spam',
    type: 'n8n-nodes-base.noOp',
    typeVersion: 1,
    position: [1760, -140],
  },
  ifNode(
    'Hot Lead?',
    "$('Parse Triage').item.json.urgency === 'high' && ['buyer', 'renter', 'seller', 'agent'].includes($('Parse Triage').item.json.category) && !$('Parse Triage').item.json.triage_error",
    [1980, 100],
    'a1f0c0de-0010-4000-8000-000000000010',
  ),
  {
    parameters: {
      sendTo: args['alert-to'] ?? 'you@example.com',
      subject: `={{ ${HOT_LEAD_SUBJECT} }}`,
      emailType: 'html',
      message: `={{ ${HOT_LEAD_BODY} }}`,
      options: { appendAttribution: false },
    },
    id: 'a1f0c0de-0011-4000-8000-000000000011',
    name: 'Email Hot Lead',
    type: 'n8n-nodes-base.gmail',
    typeVersion: 2.1,
    position: [2200, 0],
    webhookId: '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f',
  },
];

// Save to Sheet sits on the "not spam" branch.
nodes.find((n) => n.name === 'Save to Sheet').position = [1760, 100];

const link = (to, index = 0) => ({ node: to, type: 'main', index });
const connections = {
  'Inquiry Webhook': { main: [[link('Clean Fields')]] },
  'Clean Fields': { main: [[link('Build Request')]] },
  'Build Request': { main: [[link('Classify with Gemini')]] },
  // Output 0 = success, output 1 = error -> try the fallback model.
  'Classify with Gemini': { main: [[link('Parse Triage')], [link('Classify with Fallback Model')]] },
  'Classify with Fallback Model': { main: [[link('Parse Triage')]] },
  'Parse Triage': { main: [[link('Respond')]] },
  // Reply to the form right away, then keep routing in the background.
  Respond: { main: [[link('Is Spam?')]] },
  'Is Spam?': { main: [[link('Drop Spam')], [link('Save to Sheet')]] },
  'Save to Sheet': { main: [[link('Hot Lead?')]] },
  'Hot Lead?': { main: [[link('Email Hot Lead')], []] },
};

if (args['sheets-cred']) {
  nodes.find((n) => n.name === 'Save to Sheet').credentials = {
    googleSheetsOAuth2Api: { id: args['sheets-cred'], name: 'Google Sheets account' },
  };
}
if (args['gmail-cred']) {
  nodes.find((n) => n.name === 'Email Hot Lead').credentials = {
    gmailOAuth2: { id: args['gmail-cred'], name: 'Gmail account' },
  };
}
if (args['gemini-cred']) {
  for (const name of ['Classify with Gemini', 'Classify with Fallback Model']) {
    nodes.find((n) => n.name === name).credentials = {
      googlePalmApi: { id: args['gemini-cred'], name: 'Google Gemini(PaLM) Api account' },
    };
  }
}

const workflow = {
  ...(args.id ? { id: args.id } : {}),
  name: 'Inquiry Triage',
  nodes,
  connections,
  settings: { executionOrder: 'v1', timezone: 'Asia/Manila' },
  active: false,
};

const out = args.out ?? join(ROOT, 'workflows', 'triage.json');
writeFileSync(out, JSON.stringify(workflow, null, 2) + '\n');
console.log(`Wrote ${out}`);
