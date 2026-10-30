# CW-OODA-092 Evidence Checkpoint

Record prepared: 2026-10-30  
Status: LOCAL_PREPARED · ATTESTATION_NOT_SUBMITTED · PRODUCTION_HOLD

## Required fields

```json
{
  "record_id": "CW-OODA-092",
  "chain_id": 8453,
  "settlement_tx": null,
  "verified_on_chain": false,
  "payment_authenticated": false,
  "settlement_disposition": "NO_EVIDENCE",
  "production_authorized": false
}
```

## Evidence boundary preserved

| Evidence kind | What it establishes | Bound to this rail |
|---------------|---------------------|--------------------|
| EAS attestation | A signer committed to an audit claim | Not submitted |
| Circle CCTP attestation | Circle authorized a cross-chain mint | Not this payment |
| Base transaction receipt | A transaction executed on Base | No hash present |

## Verification gates required before any flag change

When a real settlement hash becomes available, independently validate:

1. Chain ID = 8453 (0x2105)
2. Transaction receipt status = 1
3. Native USDC contract = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
4. Transfer recipient = 0xA380552a27b0a5a2874Ea7AA52CAC09f542002E8
5. Amount = 1,000,000 base units (exactly 1 USDC)
6. Payment-to-request binding (replay protection)
7. Block status / finality consistent with the receipt

A receipt with status = 1 alone is insufficient.

## Mathematical check (not a transaction)

- Base chain ID 8453 = 0x2105 confirmed
- Exactly 1 native USDC = 1,000,000 base units confirmed
- Five required Boolean checks: 1 of 32 combinations satisfies all five

These results validate the arithmetic and logical model. They do not establish an actual transaction.

## Disposition

OODA 092 · MATHEMATICAL CHECK PASS · NO SETTLEMENT HASH · EVIDENCE CHECKPOINT PREPARED LOCALLY · ATTESTATION NOT SUBMITTED · PRODUCTION HOLD

No wallets accessed. No transactions signed. No deployments. No EAS attestation submitted.

---

## OODA 093 Reconciliation (append-only)

Recorded: 2026-10-30  
SHA-256 of this file at preparation: 66f74f082a8b9ad3c76ebec1d3021ee176ee9e1f7ecbe82f55003cc4a65282d3

### Drive 15-field receipt schema

Document: Base EAS Receipt Registry V0.1 — 15-Field Schema + viem + Resolver  
Drive ID: 1-hxn4CQ7ahyTg7XgewwnzSKGdp6-Nj4BDrNd8fN4rrQ  

State recorded in document:
- SCHEMA_REGISTERED = FALSE
- ATTESTATION_SUBMITTED = FALSE
- RESOLVER_DEPLOYED = FALSE
- AUTHORITY_CREATED = FALSE

Canonical schema string (15 fields):
`uint256 chainId,bytes32 schemaUID,bytes32 attestationUID,bytes32 txHash,uint256 blockNumber,bytes32 blockHash,uint256 transactionIndex,address from,address to,uint256 gasUsed,uint256 cumulativeGasUsed,uint256 effectiveGasPrice,uint8 status,address contractAddress,bytes32 logsHash`

Resolver limitation documented: RESOLVER_PASS = STRUCTURE + EAS_REFERENCE_CONSISTENCY ≠ HISTORICAL_RECEIPT_INCLUSION_PROOF

This document is a draft design. It is not evidence of a registered schema.

### Six-field schema recovered from Base EAS registry

| Field | Value |
|-------|-------|
| Schema # | 1994 |
| UID | 0x71129355dc6fa5c895809cbb7d85ee12505dfd1589aaa378cea9babc5035f967 |
| Schema string | string recordId,uint64 snapshotDate,bytes32 manifestHash,string manifestURI,string disposition,bool authorityCreated |
| Creator | 0x0F7018fea1dc9ba32aE817D896211f72f1197AD8 |
| Registration tx | 0x0fd59198b3aa3a8dd65bc751cc46877474223b63277467d42782de269ebd9d2b |
| Resolver | 0x0000000000000000000000000000000000000000 |
| Revocable | Yes |
| Attestations | 0 onchain, 0 offchain |
| Explorer | https://base.easscan.org/schema/view/0x71129355dc6fa5c895809cbb7d85ee12505dfd1589aaa378cea9babc5035f967 |

This UID is recovered from the public Base registry. It is not yet bound to a Computer Wisdom attestation. Creator address is not one of the previously recorded attester addresses (0xA380…02E8, 0x1dB2…b8b5, 0xC345…5a84).

### GitHub commit e97a3a1

Independent lookup in jsonwisdom/COMPUTERWISDOM and jsonwisdom/flywheel-of-wisdom returned no matching commit. The short SHA was not located in the expected repositories.

### Schema separation

| Schema | Fields | Registered | Bound to this rail |
|--------|--------|------------|--------------------|
| 15-field receipt | chainId, schemaUID, attestationUID, txHash, blockNumber, blockHash, transactionIndex, from, to, gasUsed, cumulativeGasUsed, effectiveGasPrice, status, contractAddress, logsHash | FALSE (per Drive document) | Not substituted |
| 6-field registry | recordId, snapshotDate, manifestHash, manifestURI, disposition, authorityCreated | TRUE (UID recovered) | Not yet attested |

### Updated disposition

OODA 093 · CROSS-SOURCE RECONCILIATION COMPLETE · SIX-FIELD UID RECOVERED · 15-FIELD REMAINS UNREGISTERED · SETTLEMENT HOLD · PRODUCTION HOLD

No files modified in any repository. No contracts deployed. No signatures produced. No transactions submitted. No attestation submitted.
