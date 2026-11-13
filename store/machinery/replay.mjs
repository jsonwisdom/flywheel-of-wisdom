import { createHash } from 'node:crypto';

// Deterministic candidate, no network, no wallet, no money mutation.
export const hash = (record) => createHash('sha256').update(JSON.stringify(record)).digest('hex');
export const zero = (sku, stock) => ({ sku, stock, available: stock, reserved: 0, fulfilled: 0, orders: {}, events: [] });
function invariant(s) {
  if (![s.stock,s.available,s.reserved,s.fulfilled].every(n => Number.isSafeInteger(n) && n >= 0)) throw Error('NEGATIVE_OR_INVALID_QUANTITY');
  if (s.available + s.reserved + s.fulfilled !== s.stock) throw Error('STOCK_CONSERVATION_FAILURE');
}
function apply(s, e) {
  if (!['RESERVE','SETTLE','FULFILL','RELEASE'].includes(e.type)) throw Error('INVALID_EVENT_TYPE');
  if (!e.id || !e.orderId || !e.sku || e.sku !== s.sku) throw Error('INVALID_EVENT_IDENTITY');
  if (s.events.some(x => x.id === e.id)) {
    const previous = s.events.find(x => x.id === e.id);
    if (hash({...previous, seq:undefined, prevHash:undefined, eventHash:undefined}) !== hash({...e, seq:undefined, prevHash:undefined, eventHash:undefined})) throw Error('IDEMPOTENCY_COLLISION');
    return s;
  }
  const order = s.orders[e.orderId];
  if (e.type === 'RESERVE') {
    if (order) throw Error('ORDER_ALREADY_EXISTS');
    if (!Number.isSafeInteger(e.qty) || e.qty <= 0 || s.available < e.qty) throw Error('INSUFFICIENT_STOCK');
    s.available -= e.qty; s.reserved += e.qty;
    s.orders[e.orderId] = { qty:e.qty, state:'RESERVED', paymentRef:null, deliveryRef:null };
  } else {
    if (!order) throw Error('UNKNOWN_ORDER');
    if (e.type === 'SETTLE') {
      if (order.state !== 'RESERVED' || e.verdict !== 'PASS' || !e.paymentRef) throw Error('PAYMENT_PROOF_REQUIRED');
      if (s.events.some(x => x.type === 'SETTLE' && x.paymentRef === e.paymentRef)) throw Error('DUPLICATE_PAYMENT_REFERENCE');
      order.paymentRef = e.paymentRef; order.state = 'SETTLED';
    } else if (e.type === 'FULFILL') {
      if (order.state !== 'SETTLED' || !e.deliveryRef) throw Error('FULFILLMENT_GATE_FAILED');
      s.reserved -= order.qty; s.fulfilled += order.qty;
      order.deliveryRef = e.deliveryRef; order.state = 'FULFILLED';
    } else if (e.type === 'RELEASE') {
      if (order.state !== 'RESERVED') throw Error('RELEASE_REQUIRES_UNPAID_RESERVATION');
      s.reserved -= order.qty; s.available += order.qty;
      order.state = 'RELEASED';
    }
  }
  invariant(s);
  const prevHash = s.events.length ? s.events.at(-1).eventHash : null;
  const entry = { ...e, seq:s.events.length + 1, prevHash };
  entry.eventHash = hash(entry);
  s.events.push(entry);
  return s;
}
export function forward(sku, stock, events) {
  if (!sku || !Number.isSafeInteger(stock) || stock < 0) throw Error('INVALID_INVENTORY');
  const state = zero(sku, stock);
  for (const e of events) {
    const { seq, prevHash, eventHash, ...payload } = e;
    apply(state, payload);
    const actual = state.events.at(-1);
    if (seq !== undefined && (seq !== actual.seq || prevHash !== actual.prevHash || eventHash !== actual.eventHash)) throw Error('EVENT_TAMPER');
  }
  return state;
}
export function reverse(sku, stock, events) {
  const state = forward(sku, stock, events);
  const journal = state.events;
  const reversed = [...journal].reverse().map(e => ({ seq:e.seq, id:e.id, type:e.type, orderId:e.orderId, eventHash:e.eventHash, prevHash:e.prevHash }));
  for (let i=0;i<reversed.length-1;i++) {
    if (reversed[i].prevHash !== reversed[i+1].eventHash) throw Error('REVERSE_CHAIN_BROKEN');
  }
  if (reversed.length && reversed.at(-1).prevHash !== null) throw Error('GENESIS_BROKEN');
  invariant(state);
  return { latestHash:journal.at(-1)?.eventHash ?? null, originStock:stock, chainVerified:true, eventCount:journal.length, states:state };
}
export function event(id, type, orderId, sku, extra={}) { return {id, type, orderId, sku, ...extra}; }
