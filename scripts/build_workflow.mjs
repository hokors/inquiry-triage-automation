// Builds workflows/triage.json from the prompt and Code-node files, so the
// logic stays readable in the repo instead of living only inside n8n.
//
//   node scripts/build_workflow.mjs
//   node scripts/build_workflow.mjs --out <file> --id <workflowId> --sheets-cred <id> [--gemini-cred <id>]
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
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1lF7IFxnXTz6ABypaBHfcWUZZUrpNimazLGtt6FofWvg/edit';

const systemPrompt = read('prompts/system_prompt.md').trim();
const buildRequestSrc = read('workflows/code/build_request.js');
const PLACEHOLDER = 'const SYSTEM_PROMPT = __SYSTEM_PROMPT__;';
if (!buildRequestSrc.includes(PLACEHOLDER)) throw new Error(`build_request.js is missing: ${PLACEHOLDER}`);
const buildRequest = buildRequestSrc.replace(PLACEHOLDER, () => `const SYSTEM_PROMPT = ${JSON.stringify(systemPrompt)};`);
const parseTriage = read('workflows/code/parse_triage.js');

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
  {
    parameters: {
      method: 'POST',
      url: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      authentication: 'predefinedCredentialType',
      nodeCredentialType: 'googlePalmApi',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify($json.gemini_request) }}',
      options: { timeout: 30000 },
    },
    id: 'a1f0c0de-0006-4000-8000-000000000006',
    name: 'Classify with Gemini',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [660, 0],
    retryOnFail: true,
    maxTries: 3,
    waitBetweenTries: 2000,
    onError: 'continueRegularOutput',
  },
  {
    parameters: { mode: 'runOnceForEachItem', jsCode: parseTriage },
    id: 'a1f0c0de-0007-4000-8000-000000000007',
    name: 'Parse Triage',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [880, 0],
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
];

const chain = ['Inquiry Webhook', 'Clean Fields', 'Build Request', 'Classify with Gemini', 'Parse Triage', 'Save to Sheet', 'Respond'];
const connections = Object.fromEntries(
  chain.slice(0, -1).map((from, i) => [from, { main: [[{ node: chain[i + 1], type: 'main', index: 0 }]] }]),
);

if (args['sheets-cred']) {
  nodes.find((n) => n.name === 'Save to Sheet').credentials = {
    googleSheetsOAuth2Api: { id: args['sheets-cred'], name: 'Google Sheets account' },
  };
}
if (args['gemini-cred']) {
  nodes.find((n) => n.name === 'Classify with Gemini').credentials = {
    googlePalmApi: { id: args['gemini-cred'], name: 'Google Gemini(PaLM) Api account' },
  };
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
