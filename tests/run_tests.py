"""Send every test case to the n8n webhook and score the LLM's answers.

Usage:
    pip install requests
    python tests/run_tests.py

The webhook must respond with the triage JSON (use a "Respond to Webhook" node).
"""
import csv
import json
import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
CASES = ROOT / "tests" / "test_cases.csv"
REPORT = ROOT / "docs" / "test_report.csv"
FIELDS = ["category", "urgency", "needs_human"]


def load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def main():
    load_env()
    url = os.environ.get("WEBHOOK_URL")
    if not url:
        sys.exit("Set WEBHOOK_URL in .env (see .env.example)")

    cases = list(csv.DictReader(CASES.open(encoding="utf-8")))
    correct = {f: 0 for f in FIELDS}
    rows = []

    for case in cases:
        try:
            r = requests.post(url, json={"message": case["message"]}, timeout=60)
            r.raise_for_status()
            got = r.json()
        except (requests.RequestException, json.JSONDecodeError) as e:
            got = {"error": str(e)}

        result = {"id": case["id"], "message": case["message"]}
        for f in FIELDS:
            expected = case[f"expected_{f}"].strip().lower()
            actual = str(got.get(f, "")).strip().lower()
            ok = expected == actual
            correct[f] += ok
            result[f"expected_{f}"] = expected
            result[f"actual_{f}"] = actual
            result[f"{f}_ok"] = ok
        result["all_ok"] = all(result[f"{f}_ok"] for f in FIELDS)
        rows.append(result)
        print(f"[{'PASS' if result['all_ok'] else 'FAIL'}] #{case['id']} {case['message'][:50]!r}")

    n = len(cases)
    print(f"\n{n} cases")
    for f in FIELDS:
        print(f"  {f:<12} {correct[f]}/{n}  ({correct[f] / n:.0%})")
    print(f"  all fields   {sum(r['all_ok'] for r in rows)}/{n}")

    REPORT.parent.mkdir(exist_ok=True)
    with REPORT.open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"\nReport written to {REPORT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
