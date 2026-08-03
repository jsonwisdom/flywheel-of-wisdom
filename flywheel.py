#!/usr/bin/env python3
"""
Flywheel of Wisdom - smallest complete SYNTHETIC workflow.

QUESTION_SUBMITTED -> MOCK_$1_ACCEPTED -> 60_SECOND_RESPONSE ->
WISDOM_RECEIPT_GENERATED -> REPLAY_ID_CREATED -> SHARE_ARTIFACT_CREATED ->
TALLEY_UPDATED

Everything here is local and synthetic:
  - MockPaymentAdapter never touches a real payment rail. It cannot -
    there is no real payment rail wired in.
  - The talley ledger this writes to is a SEPARATE, clearly-labeled file
    from the real business scoreboard tracked elsewhere in this project.
    Nothing here should ever be read as evidence of real revenue.
  - "direct_answer"/"known"/"assumed"/"unknown"/"next_move" must be
    supplied by the caller (Jay, in the real flow) - this module does not
    generate wisdom, it only structures and makes replayable whatever
    content it's given.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).parent
SHARE_DIR = ROOT / "receipts"
TALLEY_PATH = ROOT / "talley_synthetic.json"


class MockPaymentAdapter:
    """MOCK ONLY. Does not process real payments. No real payment rail,
    wallet, or account is connected anywhere in this module."""

    def accept(self, amount_usd: float, payer_ref: str) -> dict:
        if amount_usd != 1.0:
            raise ValueError("this mock adapter only simulates the $1 unit")
        mock_reference = f"MOCK-{hashlib.sha256(payer_ref.encode()).hexdigest()[:12]}"
        return {"is_mock": True, "amount_usd": 1.0, "mock_reference": mock_reference}


@dataclass
class PendingQuestion:
    question_id: str
    question: str
    submitted_at: str
    mock_payment: dict


@dataclass
class WisdomReceipt:
    schema_version: str
    receipt_id: str
    replay_id: str
    question: str
    direct_answer: str
    known: list[str]
    assumed: list[str]
    unknown: list[str]
    next_move: str
    timestamp: str
    share_artifact_path: str
    mock_payment: dict

    def to_dict(self) -> dict:
        return asdict(self)


def submit_question(question: str, submitter_ref: str) -> PendingQuestion:
    """QUESTION_SUBMITTED -> MOCK_$1_ACCEPTED"""
    if not question or not question.strip():
        raise ValueError("question must be non-empty")

    adapter = MockPaymentAdapter()
    mock_payment = adapter.accept(amount_usd=1.0, payer_ref=submitter_ref)

    question_id = f"Q-{hashlib.sha256((question + submitter_ref).encode()).hexdigest()[:12]}"
    return PendingQuestion(
        question_id=question_id,
        question=question,
        submitted_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        mock_payment=mock_payment,
    )


def _canonical_content_hash(question: str, direct_answer: str, known: list[str],
                             assumed: list[str], unknown: list[str], next_move: str) -> str:
    """REPLAY_ID_CREATED. Deterministic: same content in, same hash out -
    this is what makes the receipt replay-verifiable rather than a bare
    claim. Re-derive with the same inputs to check a receipt's integrity."""
    payload = json.dumps({
        "question": question,
        "direct_answer": direct_answer,
        "known": known,
        "assumed": assumed,
        "unknown": unknown,
        "next_move": next_move,
    }, sort_keys=True).encode("utf-8")
    return "0x" + hashlib.sha256(payload).hexdigest()


def generate_receipt(pending: PendingQuestion, direct_answer: str, known: list[str],
                      assumed: list[str], unknown: list[str], next_move: str) -> WisdomReceipt:
    """60_SECOND_RESPONSE -> WISDOM_RECEIPT_GENERATED -> REPLAY_ID_CREATED

    direct_answer/known/assumed/unknown/next_move must be supplied by the
    caller - this function only structures them, it does not invent them.
    """
    if not direct_answer or not direct_answer.strip():
        raise ValueError("direct_answer must be supplied by the caller, not generated here")

    replay_id = _canonical_content_hash(pending.question, direct_answer, known, assumed,
                                         unknown, next_move)
    receipt_id = f"WR-{pending.question_id}"
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    share_path = str((SHARE_DIR / f"{receipt_id}.md").relative_to(ROOT))

    return WisdomReceipt(
        schema_version="WISDOM_RECEIPT_V1",
        receipt_id=receipt_id,
        replay_id=replay_id,
        question=pending.question,
        direct_answer=direct_answer,
        known=known,
        assumed=assumed,
        unknown=unknown,
        next_move=next_move,
        timestamp=timestamp,
        share_artifact_path=share_path,
        mock_payment=pending.mock_payment,
    )


def create_share_artifact(receipt: WisdomReceipt) -> Path:
    """SHARE_ARTIFACT_CREATED. Writes a local markdown file. This is NOT a
    public URL - no hosting exists in this build. share_artifact_path on
    the receipt is a local path, not a share link, until publishing is
    explicitly set up."""
    SHARE_DIR.mkdir(parents=True, exist_ok=True)
    out_path = ROOT / receipt.share_artifact_path

    def _bullets(items: list[str]) -> list[str]:
        return [f"- {item}" for item in items] if items else ["- (none listed)"]

    lines = [
        f"# {receipt.question}",
        "",
        f"**Direct answer:** {receipt.direct_answer}",
        "",
        "**Known:**",
        *_bullets(receipt.known),
        "",
        "**Assumed:**",
        *_bullets(receipt.assumed),
        "",
        "**Unknown:**",
        *_bullets(receipt.unknown),
        "",
        f"**Next move:** {receipt.next_move}",
        "",
        f"---",
        f"Receipt ID: `{receipt.receipt_id}`",
        f"Replay ID: `{receipt.replay_id}`",
        f"Generated: {receipt.timestamp}",
        "",
        "*This is a SYNTHETIC example receipt from a local test workflow. "
        "The $1 payment behind it is mocked - no real transaction occurred.*",
    ]
    out_path.write_text("\n".join(lines), encoding="utf-8")
    return out_path


def update_talley(receipt: WisdomReceipt) -> dict:
    """TALLEY_UPDATED. Writes to a SEPARATE synthetic ledger file, never
    the real business scoreboard tracked elsewhere in this project. Every
    entry is explicitly marked is_mock: true so it can never be
    misread as real revenue."""
    if TALLEY_PATH.exists():
        ledger = json.loads(TALLEY_PATH.read_text(encoding="utf-8"))
    else:
        ledger = {"schema_version": "SYNTHETIC_TALLEY_V1", "is_mock": True, "entries": []}

    ledger["entries"].append({
        "receipt_id": receipt.receipt_id,
        "replay_id": receipt.replay_id,
        "mock_amount_usd": receipt.mock_payment["amount_usd"],
        "timestamp": receipt.timestamp,
    })
    TALLEY_PATH.write_text(json.dumps(ledger, indent=2, sort_keys=True), encoding="utf-8")
    return ledger


def run_synthetic_workflow(question: str, submitter_ref: str, direct_answer: str,
                            known: list[str], assumed: list[str], unknown: list[str],
                            next_move: str) -> WisdomReceipt:
    """The full pipeline, end to end, synthetic throughout."""
    pending = submit_question(question, submitter_ref)
    receipt = generate_receipt(pending, direct_answer, known, assumed, unknown, next_move)
    create_share_artifact(receipt)
    update_talley(receipt)
    return receipt


def verify_replay(receipt: WisdomReceipt) -> bool:
    """Re-derive the replay_id from the receipt's own content and compare.
    This is the actual replay check - not a claim, a recomputation."""
    recomputed = _canonical_content_hash(
        receipt.question, receipt.direct_answer, receipt.known,
        receipt.assumed, receipt.unknown, receipt.next_move,
    )
    return recomputed == receipt.replay_id


if __name__ == "__main__":
    receipt = run_synthetic_workflow(
        question="Does a $1 question-answering product need its own payment rail before launch?",
        submitter_ref="synthetic-demo-user",
        direct_answer="No - a synthetic/mock version can prove the workflow end to end first.",
        known=["The $300 offer already required no automation to test demand",
               "Automation was deliberately deferred until real repeated demand exists"],
        assumed=["A $1 price point lowers the barrier to a first real transaction"],
        unknown=["Whether anyone will actually pay $1 for this without it being tested",
                 "What real questions will actually look like, as opposed to this example"],
        next_move="Run this synthetic workflow, verify it end to end, then decide whether "
                   "to test it with a real (still-manual) $1 ask before building anything further.",
    )
    print(json.dumps(receipt.to_dict(), indent=2))
    print()
    print(f"replay verified: {verify_replay(receipt)}")
