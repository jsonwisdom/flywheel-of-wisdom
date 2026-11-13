import test from 'node:test';
import assert from 'node:assert/strict';
import {forward,reverse,event} from './replay.mjs';
const sku='wisdom-receipt-v1';
const e=(id,type,order,extra={})=>event(id,type,order,sku,extra);
test('forward/reverse conserves 500 units after 3 reservations, 2 fulfilled, 1 released',()=>{
 const ev=[e('1','RESERVE','a',{qty:1}),e('2','RESERVE','b',{qty:1}),e('3','RESERVE','c',{qty:1}),e('4','SETTLE','a',{verdict:'PASS',paymentRef:'pay:a'}),e('5','FULFILL','a',{deliveryRef:'asset:a'}),e('6','SETTLE','b',{verdict:'PASS',paymentRef:'pay:b'}),e('7','FULFILL','b',{deliveryRef:'asset:b'}),e('8','RELEASE','c')];
 const f=forward(sku,500,ev); const r=reverse(sku,500,f.events); assert.equal(f.available,498); assert.equal(f.reserved,0); assert.equal(f.fulfilled,2); assert.equal(r.chainVerified,true); assert.equal(r.eventCount,8);
});
test('no oversell',()=>assert.throws(()=>forward(sku,1,[e('1','RESERVE','a',{qty:2})]),/INSUFFICIENT_STOCK/));
test('unknown settlement cannot fulfill',()=>assert.throws(()=>forward(sku,1,[e('1','RESERVE','a',{qty:1}),e('2','SETTLE','a',{verdict:'UNKNOWN',paymentRef:'x'})]),/PAYMENT_PROOF_REQUIRED/));
test('no fulfillment without settlement',()=>assert.throws(()=>forward(sku,1,[e('1','RESERVE','a',{qty:1}),e('2','FULFILL','a',{deliveryRef:'x'})]),/FULFILLMENT_GATE_FAILED/));
test('idempotent duplicate exact event',()=>{const a=e('1','RESERVE','a',{qty:1});assert.equal(forward(sku,2,[a,a]).events.length,1)});
test('idempotency key collision fails',()=>assert.throws(()=>forward(sku,2,[e('1','RESERVE','a',{qty:1}),e('1','RESERVE','a',{qty:2})]),/IDEMPOTENCY_COLLISION/));
test('payment reference cannot be reused',()=>assert.throws(()=>forward(sku,3,[e('1','RESERVE','a',{qty:1}),e('2','RESERVE','b',{qty:1}),e('3','SETTLE','a',{verdict:'PASS',paymentRef:'same'}),e('4','SETTLE','b',{verdict:'PASS',paymentRef:'same'})]),/DUPLICATE_PAYMENT_REFERENCE/));
test('replay detects changed bytes',()=>{const f=forward(sku,1,[e('1','RESERVE','a',{qty:1})]);const modified=structuredClone(f.events);modified[0].qty=2;assert.throws(()=>reverse(sku,1,modified))});
test('released reservation cannot settle',()=>assert.throws(()=>forward(sku,2,[e('1','RESERVE','a',{qty:1}),e('2','RELEASE','a'),e('3','SETTLE','a',{verdict:'PASS',paymentRef:'x'})]),/PAYMENT_PROOF_REQUIRED/));
