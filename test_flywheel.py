#!/usr/bin/env python3
"""Tests for the synthetic Flywheel of Wisdom workflow. Uses unittest's
assert* methods throughout (never bare `assert`), consistent with the
rest of this project."""

from __future__ import annotations

import json
import shutil
import unittest
from pathlib import Path

import jsonschema

import flywheel

ROOT = Path(__file__).parent
SCHEMA_PATH = ROOT / "schema" / "WISDOM_RECEIPT_V1.schema.json"


def _run_example():
    return flywheel.run_synthetic_workflow(
        question="Is this test question real?",
        submitter_ref="test-user",
        direct_answer="No, this is a synthetic test fixture.",
        known=["This is a test"],
        assumed=["Nobody is actually paying for this"],
        unknown=["Whether the real product will look like this"],
        next_move="Run the test suite.",
    )


class TestFullPipeline(unittest.TestCase):
    def setUp(self):
        if flywheel.SHARE_DIR.exists():
            shutil.rmtree(flywheel.SHARE_DIR)
        if flywheel.TALLEY_PATH.exists():
            flywheel.TALLEY_PATH.unlink()

    def test_end_to_end_produces_a_receipt(self):
        receipt = _run_example()
        self.assertEqual(receipt.schema_version, "WISDOM_RECEIPT_V1")
        self.assertTrue(receipt.receipt_id)
        self.assertTrue(receipt.replay_id.startswith("0x"))

    def test_receipt_conforms_to_schema(self):
        receipt = _run_example()
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        errors = list(jsonschema.Draft7Validator(schema).iter_errors(receipt.to_dict()))
        self.assertEqual(errors, [], f"schema violations: {errors}")

    def test_mock_payment_is_always_marked_mock(self):
        receipt = _run_example()
        self.assertTrue(receipt.mock_payment["is_mock"])
        self.assertEqual(receipt.mock_payment["amount_usd"], 1.0)
        self.assertTrue(receipt.mock_payment["mock_reference"].startswith("MOCK-"))

    def test_mock_adapter_rejects_wrong_amount(self):
        adapter = flywheel.MockPaymentAdapter()
        with self.assertRaises(ValueError):
            adapter.accept(amount_usd=5.0, payer_ref="x")

    def test_empty_question_rejected(self):
        with self.assertRaises(ValueError):
            flywheel.submit_question("", "someone")

    def test_empty_direct_answer_rejected(self):
        pending = flywheel.submit_question("real question", "someone")
        with self.assertRaises(ValueError):
            flywheel.generate_receipt(pending, "", [], [], [], "next move")

    def test_share_artifact_actually_written_with_content(self):
        receipt = _run_example()
        path = ROOT / receipt.share_artifact_path
        self.assertTrue(path.is_file())
        content = path.read_text(encoding="utf-8")
        self.assertIn(receipt.question, content)
        self.assertIn(receipt.direct_answer, content)
        self.assertIn(receipt.receipt_id, content)
        self.assertIn("SYNTHETIC", content)

    def test_talley_accumulates_and_stays_marked_mock(self):
        _run_example()
        _run_example()
        ledger = json.loads(flywheel.TALLEY_PATH.read_text(encoding="utf-8"))
        self.assertTrue(ledger["is_mock"])
        self.assertEqual(len(ledger["entries"]), 2)
        for entry in ledger["entries"]:
            self.assertEqual(entry["mock_amount_usd"], 1.0)


class TestReplayVerification(unittest.TestCase):
    def test_replay_id_deterministic_for_same_content(self):
        h1 = flywheel._canonical_content_hash("q", "a", ["k"], ["as"], ["u"], "n")
        h2 = flywheel._canonical_content_hash("q", "a", ["k"], ["as"], ["u"], "n")
        self.assertEqual(h1, h2)

    def test_replay_id_differs_for_different_content(self):
        h1 = flywheel._canonical_content_hash("q", "a", ["k"], ["as"], ["u"], "n")
        h2 = flywheel._canonical_content_hash("q", "a DIFFERENT", ["k"], ["as"], ["u"], "n")
        self.assertNotEqual(h1, h2)

    def test_verify_replay_passes_on_unmodified_receipt(self):
        receipt = _run_example()
        self.assertTrue(flywheel.verify_replay(receipt))

    def test_verify_replay_detects_tampering(self):
        receipt = _run_example()
        receipt.direct_answer = "This was changed after the receipt was generated."
        self.assertFalse(flywheel.verify_replay(receipt))


if __name__ == "__main__":
    unittest.main(verbosity=2)
