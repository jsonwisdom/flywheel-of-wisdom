# Flywheel of Wisdom — synthetic workflow (local, mock, not deployed)

This is the smallest complete **synthetic** version of the $1/60-second
Wisdom Receipt pipeline:

```text
QUESTION_SUBMITTED -> MOCK_$1_ACCEPTED -> 60_SECOND_RESPONSE ->
WISDOM_RECEIPT_GENERATED -> REPLAY_ID_CREATED -> SHARE_ARTIFACT_CREATED ->
TALLEY_UPDATED
```

## What's real here and what isn't

- **Real:** the pipeline logic, the receipt schema, the deterministic
  replay-id (a SHA-256 of the receipt's own content - re-derive it from
  the same inputs and it matches), the generated markdown share artifact,
  the local synthetic ledger, and the test suite (12 tests, all passing).
- **Mock, explicitly:** `MockPaymentAdapter` never touches a real payment
  rail - there isn't one wired in. Every mock payment is hard-marked
  `is_mock: true` at both the code and schema level (the schema `const`s
  it, so this can't silently become "real" without a new schema version).
  `talley_synthetic.json` is a separate file from the real business
  scoreboard tracked elsewhere in this project - nothing in it should ever
  be read as evidence of real revenue.
- **Not built:** wallet integration, real payment processing, actual
  60-second timing enforcement, automated answer generation (the
  direct_answer/known/assumed/unknown/next_move content is always
  supplied by the caller - this module structures it, it doesn't invent
  wisdom).

## Run it

```bash
python flywheel.py        # runs one synthetic example end to end
python test_flywheel.py   # 12 tests
```

## Relationship to other work in this project

- Does not touch `receiptos-base`.
- Does not merge or read from the `ask-jay-redesign` branch.
- Entirely separate from the live `$300` Permission Revocation offer in
  `receiptos-replay-proof` - nothing here changes that offer.
- Not yet under git version control and not published anywhere.
