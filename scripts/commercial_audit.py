#!/usr/bin/env python3
"""Audit First commercial readiness: observations -> explicit recovery actions.
Read-only. Never signs, charges, deploys, publishes, or infers customer revenue.
"""
import json
import pathlib
import re
import sys
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
def read(name):
    p = ROOT / name
    return p.read_text(encoding="utf-8") if p.is_file() else None

server = read("server.ts")
status_text = read("STATUS.json")
workflow = read(".github/workflows/ci.yml")
service = read("services/x402-v2/package.json")
results = []

def check(identifier, predicate, next_step, detail):
    results.append({
        "id": identifier,
        "evidence": "SOURCE_OBSERVED" if predicate else "ACTION_REQUIRED",
        "detail": detail,
        "next_step": next_step if not predicate else "Verify against the matching external runtime evidence",
    })

check("C01_PRODUCT_ENDPOINT", bool(server and '"GET /receipt"' in server and '"GET /knowledge"' in server),
      "Restore the $1 receipt and knowledge product definitions",
      "Presence of source definitions, not runtime reachability")
check("C02_PAYMENT_MIDDLEWARE", bool(server and "paymentMiddlewareFromHTTPServer" in server),
      "Connect payment gating before protected routes",
      "Static source inspection, not a successful paid settlement")
check("C03_CI_REPLAY", bool(workflow and "python test_flywheel.py" in workflow and "synthetic" in workflow),
      "Create deterministic CI replay tests with no money movement",
      "Workflow declared; job execution and artifact retrieval require separate verification")
check("C04_SERVICE_TESTS", bool(service),
      "Recover funds-disabled service and transaction-bound tests",
      "Service package presence only")
status = {}
if status_text:
    try:
        status = json.loads(status_text)
    except json.JSONDecodeError:
        pass
check("C05_REVENUE_BASELINE", status.get("revenue_usd") == 0,
      "Declare a sourced revenue baseline before claiming revenue",
      "STATUS.json reports zero; not independent wallet or processor reconciliation")

# These require external records and are NEVER marked evidenced from repository assertions.
for identifier, next_step in [
    ("C06_PUBLIC_URL", "Record an independently reachable live URL and HTTP 402 challenge evidence"),
    ("C07_FIRST_SETTLEMENT", "Verify Base chain transaction, payer consent, correct pay-to and fulfillment"),
    ("C08_CUSTOMER_DELIVERY", "Reproduce a paid customer's artifact delivery and proof"),
    ("C09_ACQUISITION", "Record approved public offer, traffic/lead receipts and conversion denominator"),
    ("C10_ACCOUNTING", "Reconcile wallets, processor payments, fees, refunds, chargebacks and expenses"),
    ("C11_AUTHORITY", "Obtain Jason's explicit product/price/publishing approval"),
]:
    results.append({"id": identifier, "evidence": "EXTERNAL_PROOF_REQUIRED",
                    "detail": "Not demonstrable by source code or a CI green check",
                    "next_step": next_step})

report = {
    "schema": "computerwisdom.commercial_audit.v1",
    "generated_utc": datetime.now(timezone.utc).isoformat(),
    "scope": "repository_static_only",
    "source_status_revenue_usd": status.get("revenue_usd"),
    "authority_created": False, "funds_moved": False,
    "production_claim": False,
    "counts": {key: sum(r["evidence"] == key for r in results)
               for key in ("SOURCE_OBSERVED", "ACTION_REQUIRED", "EXTERNAL_PROOF_REQUIRED")},
    "checks": results,
}
path = pathlib.Path("commercial-readiness.json")
path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
sys.exit(1 if any(r["evidence"] == "ACTION_REQUIRED" for r in results) else 0)
