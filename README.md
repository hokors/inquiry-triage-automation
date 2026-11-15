# Inquiry Triage Automation

An n8n workflow that takes real-estate inquiry form submissions, uses an LLM to **summarize, classify and draft a reply**, then routes each lead to the right place (Slack, email or a Google Sheet).

> Status: in progress (Day 3 of 7 done). Classification runs on Gemini (main model `gemini-flash-lite-latest` (~1–2 s), falling back to `gemini-flash-latest` if it fails) with a JSON response schema. Built and tested with **sample data only**.

## How it works

```
Inquiry form ──► Webhook ──► Clean Fields ──► Build Request ──► Gemini ──────────────┐
                                                                  └─ fails ─► Fallback model ─┤
                                                                                              ▼
                                   Respond to form ◄── Parse & validate JSON (bad output → needs_human)
                                          │
                                       Is spam? ── yes ──► dropped
                                          │ no
                                    Save to Google Sheet ──► Hot lead? ── yes ──► Gmail alert with draft reply
```

The form gets its response as soon as the inquiry is classified; logging and alerts run after.
The alert recipient (`sendTo` in the Email Hot Lead node) is a placeholder in the repo; set it in n8n.

The LLM returns strict JSON matching [`prompts/schema.json`](prompts/schema.json):

| Field | Values |
|---|---|
| `category` | buyer, renter, seller, agent, spam, other |
| `urgency` | high, medium, low |
| `summary` | one sentence |
| `property_mentioned` | string or null |
| `draft_reply` | max 3 sentences |
| `needs_human` | true / false |

## Repo layout

| Path | What's in it |
|---|---|
| `prompts/system_prompt.md` | System prompt for the LLM node |
| `prompts/schema.json` | JSON Schema for the LLM output |
| `workflows/triage.json` | The n8n workflow (generated, import this) |
| `workflows/code/` | JavaScript for the Build Request and Parse Triage Code nodes |
| `scripts/build_workflow.mjs` | Rebuilds `triage.json` from the prompt and code files: `node scripts/build_workflow.mjs` |
| `tests/test_cases.csv` | Labelled sample inquiries |
| `tests/run_tests.py` | Sends every test case to the webhook and scores the results |
| `docs/` | Test reports, diagrams, screenshots |

## Setup

1. Install n8n on **Node 24** (n8n's native add-ons don't build on Node 26 yet):
   `npm install -g n8n --allow-scripts=sqlite3,isolated-vm,msgpackr-extract,@parcel/watcher,ssh2,protobufjs`
2. Start it with `scripts\start-n8n.cmd` (sets Node 24 and Asia/Manila time), then open http://localhost:5678.
3. Import `workflows/triage.json` (Overview → Create workflow → ⋯ → Import from File).
4. Google Sheets: create an OAuth client in Google Cloud (Sheets + Drive APIs enabled, yourself as a test user,
   redirect URI `http://localhost:5678/rest/oauth2-credential/callback`) and connect it in the **Save to Sheet** node.
   The target sheet needs an `Inquiries` tab with headers `received_at, name, email, phone, property, message, source`.
5. Copy `.env.example` to `.env` and set `WEBHOOK_URL`. Never commit keys.

Quick test (click **Execute workflow** in n8n first):

```bash
curl -X POST http://localhost:5678/webhook-test/inquiry -H "Content-Type: application/json" --data-binary @tests/sample_inquiry.json
```

## Testing

30 labeled inquiries in [`tests/test_cases.csv`](tests/test_cases.csv) (English, Filipino, Taglish, typos, vague,
spam, empty, prompt injection), labeled by the rules in [`tests/labeling_guide.md`](tests/labeling_guide.md).

```bash
python tests/run_tests.py --label baseline
```

Test cases are sent with `source: "test_suite"`, so the workflow classifies and answers them but skips the
sheet and the email. Each run saves every case and a summary to [`docs/test_runs/`](docs/test_runs/).

| Run | Date | Model | Category | Urgency | Needs-human | All 3 | Median latency |
|---|---|---|---|---|---|---|---|
| baseline | 2026-11-15 | Gemini Flash-Lite | 90% | 93% | 37% | 30% | 1.4 s |

Problems found and how they were fixed: [`docs/failure_log.md`](docs/failure_log.md).

## Limits

- Tested only on sample inquiries, not live client data.
- The LLM can misclassify vague or mixed messages; anything uncertain goes to human review.
- Draft replies are suggestions and should be checked by a person before sending.

## 7-day plan

- [x] Day 1 – n8n setup, webhook → Google Sheet
- [x] Day 2 – LLM node with strict JSON output
- [x] Day 3 – Routing (Gmail alert / Sheet / drop)
- [ ] Day 4 – Robustness: invalid JSON, empty input, prompt injection, retries, logging
- [x] Day 5 – Test set + runner + accuracy report (baseline done; prompt fixes next)
- [ ] Day 6 – Export workflow, finish README
- [ ] Day 7 – Demo video, portfolio, LinkedIn post
