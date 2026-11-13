import test from 'node:test';
import assert from 'node:assert/strict';
// Source-only synthetic contract. No network, money or wallet operations.
const order=Object.freeze({id:'synthetic-1',service:'test-service-1',amountMinor:100,currency:'USD'});
const proof=Object.freeze({source:'INDEPENDENT_TEST_VERIFIER',verdict:'PASS',orderId:'synthetic-1',amountMinor:100,currency:'USD',environment:'TEST',paymentRef:'test-ref-1'});
function paymentOK(o,p){return !!p && p.source==='INDEPENDENT_TEST_VERIFIER' && p.verdict==='PASS' && p.environment==='TEST' && p.orderId===o.id && p.amountMinor===o.amountMinor && p.currency===o.currency && typeof p.paymentRef==='string' && p.paymentRef.length>0;}
function deliver(o,p,seen){if(!paymentOK(o,p))throw Error('PAYMENT_GATE_FAIL_CLOSED'); if(seen.has(o.id))throw Error('DUPLICATE_FULFILLMENT');seen.add(o.id);return {orderId:o.id,status:'SIMULATED_DELIVERY'};}
test('matched synthetic verifier allows simulated delivery',()=>assert.equal(deliver(order,proof,new Set()).status,'SIMULATED_DELIVERY'));
test('no proof or browser assertion cannot authorize delivery',()=>{assert.throws(()=>deliver(order,null,new Set()),/PAYMENT_GATE/);assert.throws(()=>deliver(order,{...proof,source:'BROWSER'},new Set()),/PAYMENT_GATE/);});
test('wrong order, amount or currency is rejected',()=>{for(const bad of [{orderId:'wrong'},{amountMinor:99},{currency:'EUR'}])assert.throws(()=>deliver(order,{...proof,...bad},new Set()),/PAYMENT_GATE/);});
test('duplicate delivery rejected',()=>{const seen=new Set();deliver(order,proof,seen);assert.throws(()=>deliver(order,proof,seen),/DUPLICATE_FULFILLMENT/);});
test('live mode assertion cannot substitute test proof',()=>assert.throws(()=>deliver(order,{...proof,environment:'LIVE'},new Set()),/PAYMENT_GATE/));
