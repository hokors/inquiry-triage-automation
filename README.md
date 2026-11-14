# Inquiry Triage Automation

An n8n workflow that takes real-estate inquiry form submissions, uses an LLM to **summarize, classify and draft a reply**, then routes each lead to the right place (Slack, email or a Google Sheet).

> Status: in progress (Day 1 of 7). Built and tested with **sample data only**.

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

1. Run n8n locally: `npx n8n` (or Docker), then open http://localhost:5678.
2. Import the workflow from `workflows/`.
3. Add your LLM API key and Google Sheets / Slack credentials in n8n (never commit them).
4. Copy `.env.example` to `.env` and set `WEBHOOK_URL`.

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

- [ ] Day 1 – n8n setup, webhook → Google Sheet
- [ ] Day 2 – LLM node with strict JSON output
- [ ] Day 3 – Routing (Slack / email / Sheet / drop)
- [ ] Day 4 – Robustness: invalid JSON, empty input, prompt injection, retries, logging
- [ ] Day 5 – Test set + runner + accuracy report
- [ ] Day 6 – Export workflow, finish README
- [ ] Day 7 – Demo video, portfolio, LinkedIn post
