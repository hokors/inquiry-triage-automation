# Inquiry Triage Automation

An n8n workflow that takes real-estate inquiry form submissions, uses an LLM to **summarize, classify and draft a reply**, then routes each lead to the right place (Slack, email or a Google Sheet).

> Status: in progress (Day 1 of 7 done). Built and tested with **sample data only**.

## How it works

```
Inquiry form ──► n8n Webhook ──► LLM (Claude / Gemini) ──► Parse JSON ──► Router
                                                               │             ├─ hot lead (high urgency) ──► Slack / email
                                                               │             ├─ spam ──► dropped (logged)
                                                               │             └─ everything else ──► Google Sheet
                                                               └─ parse fail / needs_human ──► "Needs human review"
```

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
| `workflows/` | Exported n8n workflow JSON |
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

```bash
pip install requests
python tests/run_tests.py
```

The script prints accuracy per field and writes the failures to `docs/test_report.csv`.

| Run | Date | Category acc. | Urgency acc. | Needs-human acc. | Notes |
|---|---|---|---|---|---|
| — | — | — | — | — | not run yet |

## Limits

- Tested only on sample inquiries, not live client data.
- The LLM can misclassify vague or mixed messages; anything uncertain goes to human review.
- Draft replies are suggestions and should be checked by a person before sending.

## 7-day plan

- [x] Day 1 – n8n setup, webhook → Google Sheet
- [ ] Day 2 – LLM node with strict JSON output
- [ ] Day 3 – Routing (Slack / email / Sheet / drop)
- [ ] Day 4 – Robustness: invalid JSON, empty input, prompt injection, retries, logging
- [ ] Day 5 – Test set + runner + accuracy report
- [ ] Day 6 – Export workflow, finish README
- [ ] Day 7 – Demo video, portfolio, LinkedIn post
