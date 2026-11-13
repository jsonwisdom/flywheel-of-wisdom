import { DurableObject } from 'cloudflare:workers';
import { InventoryLedger } from './sqlite-ledger.mjs';

// Staging adapter ONLY. Deploy only with a SQLite-backed DO migration, nodejs_compat,
// and a private Worker gateway. This file defines no anonymous write HTTP endpoint.
export class InventoryDurableObject extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ledger = new InventoryLedger(ctx.storage); // No payment verifier: settlement is disabled.
  }
  requireOperator(token) {
    if (!this.env.CW_INTERNAL_LEDGER_TOKEN || typeof token !== 'string' || token !== this.env.CW_INTERNAL_LEDGER_TOKEN) {
      throw Error('TRUSTED_GATEWAY_REQUIRED');
    }
  }
  // These RPC methods must only be used by a separate authenticated gateway.
  initialize(data, operatorToken) { this.requireOperator(operatorToken); return this.ledger.create(data); }
  reserve(data, operatorToken) { this.requireOperator(operatorToken); return this.ledger.reserve(data); }
  release(data, operatorToken) { this.requireOperator(operatorToken); return this.ledger.release(data); }
  snapshot(sku) { return this.ledger.snapshot(sku); }
  verify(sku) { return this.ledger.verifyBidirectional(sku); }
  // Fail-closed until a real Stripe / x402 verifier is integrated as trusted server-side code.
  settle() { throw Error('INDEPENDENT_SETTLEMENT_VERIFIER_REQUIRED'); }
  fulfill() { throw Error('VERIFIED_FULFILLMENT_GATE_REQUIRED'); }
  async fetch(request) {
    if (request.method !== 'GET') return new Response('Method Not Allowed', {status:405});
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({schema:'CW_SQLITE_LEDGER_DRAFT_V1',staging:true,payments:false});
    return new Response('Not Found', {status:404});
  }
}