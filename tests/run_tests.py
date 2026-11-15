"""Send every test case to the n8n webhook and score the answers.

Usage:
    python tests/run_tests.py --label baseline

Needs WEBHOOK_URL in .env (see .env.example) and the workflow published in n8n.
Cases are sent with source "test_suite", so the workflow answers them but skips
the Google Sheet and the hot-lead email. Standard library only.

Writes docs/test_runs/<timestamp>_<label>.csv (every case) and .md (summary).
"""
import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CASES = ROOT / "tests" / "test_cases.csv"
OUT_DIR = ROOT / "docs" / "test_runs"
FIELDS = ["category", "urgency", "needs_human"]


def load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def send(url, message, timeout):
    body = json.dumps({"name": "Test Suite", "message": message, "source": "test_suite"}).encode()
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    start = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        data = {"error": f"{type(e).__name__}: {e}"}
    return data, time.perf_counter() - start


def norm(value):
    return str(value).strip().lower()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--label", default="run", help="name for this run, e.g. baseline or prompt-v2")
    p.add_argument("--delay", type=float, default=4.0, help="seconds between requests (free-tier rate limits)")
    p.add_argument("--timeout", type=float, default=90.0)
    args = p.parse_args()

    load_env()
    url = os.environ.get("WEBHOOK_URL")
    if not url:
        sys.exit("Set WEBHOOK_URL in .env (see .env.example)")

    cases = list(csv.DictReader(CASES.open(encoding="utf-8")))
    rows = []
    for i, case in enumerate(cases):
        if i:
            time.sleep(args.delay)
        got, secs = send(url, case["message"], args.timeout)
        row = {"id": case["id"], "message": case["message"]}
        for f in FIELDS:
            row[f"expected_{f}"] = norm(case[f"expected_{f}"])
            row[f"actual_{f}"] = norm(got.get(f, ""))
            row[f"{f}_ok"] = row[f"expected_{f}"] == row[f"actual_{f}"]
        row["all_ok"] = all(row[f"{f}_ok"] for f in FIELDS)
        row["seconds"] = round(secs, 1)
        row["model"] = got.get("model", "")
        row["error"] = got.get("error") or got.get("triage_error", "")
        row["summary"] = got.get("summary", "")
        rows.append(row)

        misses = [f"{f}: expected {row[f'expected_{f}']}, got {row[f'actual_{f}'] or '-'}" for f in FIELDS if not row[f"{f}_ok"]]
        status = "PASS" if row["all_ok"] else "FAIL"
        print(f"[{status}] #{case['id']:>2} {secs:5.1f}s  {case['message'][:45]!r:50} {'; '.join(misses)}")

    n = len(rows)
    acc = {f: sum(r[f"{f}_ok"] for r in rows) for f in FIELDS}
    all_ok = sum(r["all_ok"] for r in rows)
    times = sorted(r["seconds"] for r in rows)
    models = Counter(r["model"] or "(none)" for r in rows)
    errors = sum(1 for r in rows if r["error"])

    stamp = datetime.now().strftime("%Y-%m-%d_%H%M")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    base = OUT_DIR / f"{stamp}_{args.label}"

    with base.with_suffix(".csv").open("w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    lines = [
        f"# Test run: {args.label} ({stamp.replace('_', ' ')})",
        "",
        f"{n} cases. Models: {', '.join(f'{m} ({c})' for m, c in models.items())}.",
        "",
        "| Field | Correct | Accuracy |",
        "|---|---|---|",
        *[f"| {f} | {acc[f]}/{n} | {acc[f] / n:.0%} |" for f in FIELDS],
        f"| **all three** | **{all_ok}/{n}** | **{all_ok / n:.0%}** |",
        "",
        f"Latency: median {times[n // 2]}s, max {times[-1]}s. Calls with errors: {errors}.",
        "",
        "## Failures",
        "",
        "| # | Message | Wrong fields |",
        "|---|---|---|",
    ]
    for r in rows:
        if not r["all_ok"]:
            wrong = ", ".join(f"{f}: {r[f'expected_{f}']} → {r[f'actual_{f}'] or '-'}" for f in FIELDS if not r[f"{f}_ok"])
            msg = (r["message"][:70] + "…") if len(r["message"]) > 70 else r["message"] or "(empty)"
            lines.append(f"| {r['id']} | {msg.replace('|', '/')} | {wrong} |")
    base.with_suffix(".md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    print()
    for f in FIELDS:
        print(f"  {f:<12} {acc[f]:>2}/{n}  ({acc[f] / n:.0%})")
    print(f"  {'all three':<12} {all_ok:>2}/{n}  ({all_ok / n:.0%})")
    print(f"  latency      median {times[n // 2]}s, max {times[-1]}s; errors: {errors}")
    print(f"\nSaved {base.with_suffix('.csv').relative_to(ROOT)} and .md")


if __name__ == "__main__":
    main()
