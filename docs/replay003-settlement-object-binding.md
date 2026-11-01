# Replay 003 — x402 v2.29.0 object binding and receipt gates

Date: 2026-11-01. Scope: READ-ONLY SDK/mock facilitator tests, no network settlement, no wallet signing, no funds. Production integration is NOT complete.

## Exact observed SDK interfaces

At `npm-@x402/core@v2.29.0`, `SettleResultContext` extends `SettleContext`:

```ts
interface SettleContext {
  paymentPayload: DeepReadonly<PaymentPayload>;
  requirements: DeepReadonly<PaymentRequirements>;
  declaredExtensions: DeepReadonly<Record<string, unknown>>;
  phase: SettlePhase;
  transportContext?: unknown;
}
interface SettleResultContext extends SettleContext {
  result: DeepReadonly<SettleResponse>;
}
```

The Express v2.29.0 HTTP transport context is:

```ts
interface HTTPTransportContext {
  request: HTTPRequestContext;
  responseBody?: Buffer;
  responseHeaders?: Record<string, string>;
}
interface HTTPRequestContext {
  adapter: HTTPAdapter;
  path: string;
  method: string;
  paymentHeader?: string;
  routePattern?: string;
  decodedPath?: string;
}
```

The Express adapter's `getPath()` returns `req.path` (no query), `getUrl()` returns scheme/host/`req.originalUrl`, and `getQueryParam(name)` accesses `req.query[name]`.

**Do not use** `requirements.resource`, `paymentPayload.resource`, or `transportContext.req.originalUrl`: none is part of the above contract. `HTTPTransportContext.request.adapter.getQueryParam('object_id')` is available; validate that the query object ID agrees with a server-generated, buffered response's object ID and immutable hash. This is a server-side binding check, **not** a claim that query parameters are signed authorization data.

Sources:
- https://github.com/x402-foundation/x402/blob/npm-%40x402/core%40v2.29.0/typescript/packages/core/src/server/x402ResourceServer.ts
- https://github.com/x402-foundation/x402/blob/npm-%40x402/core%40v2.29.0/typescript/packages/core/src/http/x402HTTPResourceServer.ts
- https://github.com/x402-foundation/x402/blob/npm-%40x402/express%40v2.29.0/typescript/packages/http/express/src/adapter.ts

## Executed test evidence

- L1–L3: tests/x402-lifecycle/lifecycle.test.mjs — **5/5** passing against real @x402/core and @x402/express v2.29.0, mock facilitator (not real payment).
- Replay 003: tests/x402-lifecycle/replay003.test.mjs — **16/16** passing against SDK hooks, Express receipt responses, fake RPC and temporary local file store. Tests include hook adapter binding, response-object mismatch rejection, persistence failure abort, duplicate tx identity conflict, L4 amount/revert failure, L5 stable receipt_id, L6 missing/unbound transactions and corrupted store failure, L7 incomplete client state, L8 wrong chain.
- Challenge validation: scripts/x402-challenge-audit.test.mjs — **18/18** passing.
- GitHub Actions run: https://github.com/jsonwisdom/flywheel-of-wisdom/actions/runs/41330321973 ; 39 checks in the two JS suites (18 + 21) plus existing Python synthetic tests. Inspect job logs for precise results.

## Security and delivery boundary

- The paid handler runs before settlement. The x402 SDK buffers paid content and flushes only after successful settlement.
- `onAfterSettle` can persist a minimal draft with transaction hash, resource ID, buffer hashes and immutable price terms. Ordinary hook exceptions are swallowed/logged; `AfterSettleAbortError` fails closed but **funds may already have moved**. Do not retry payment blindly after abort.
- An on-chain transaction receipt alone does **not** prove x402 payment or object attribution; missing drafts must be **PENDING_RECONCILIATION**, not recovered by guessing.
- `receipt_id` should exclude mutable confirmations/verification timestamps. Persist immutable receipt data, and present changing confirmations separately. Verify the on-chain transfer independently before serving receipt.
- A public receipt endpoint must not leak private KnowledgeObject content, payer private data, or secrets. The mock endpoint returns only hashes/metadata.
- In-memory or file-backed claims are single-host only; use transactional durable storage with a unique network+tx constraint for multiple Workers/origins.
- On-chain verification against mocked RPC is **not** a real Base Sepolia transaction. L4–L8 are **MOCKED EXECUTION PASS**, not **TESTNET PAYMENT PASS**.

## Remaining gates

1. Port tested hook + receipt architecture into real `server.ts`, preserve production HOLD, and use documented resource-server registration.
2. Real on-chain Base Sepolia funds-free RPC read tests, then user-authorized testnet payment (not executed here).
3. Durable shared receipt persistence, crash-reconciliation procedure, exact bytes/proof binding and unauthorized read-leak tests.
4. iPhone x402-aware payment client, signature gating, first testnet payment and real facilitator settlement evidence.
5. Only then seek separate user authorization for any mainnet transaction.

Status: `BINDING_SOURCE_VERIFIED / L1-L8_MOCK_TESTS_PASS / REAL_SETTLEMENT_NOT_TESTED / PRODUCTION_HOLD`.
