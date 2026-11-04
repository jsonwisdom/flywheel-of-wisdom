import test from "node:test";
import assert from "node:assert/strict";
import { assessEvent, assessSession } from "../payment-verdict.mjs";
const base={id:"cs_test_fixture",mode:"payment",payment_status:"paid",amount_total:100,currency:"usd",
  payment_intent:"pi_test_fixture",metadata:{object_id:"crypto-congress-audit-v1",content_sha256:"b".repeat(64)}};
test("missing data is UNKNOWN, never PASS",()=>{
  assert.equal(assessSession(null).verdict,"UNKNOWN");
  assert.equal(assessSession({...base,payment_status:"unpaid"}).verdict,"UNKNOWN");
  assert.equal(assessEvent({type:"checkout.session.completed"}).verdict,"UNKNOWN");
});
test("wrong price, currency or unknown product FAIL",()=>{
  assert.equal(assessSession({...base,amount_total:200}).reason,"PRICE_OR_MODE_MISMATCH");
  assert.equal(assessSession({...base,currency:"eur"}).verdict,"FAIL");
  assert.equal(assessSession({...base,metadata:{object_id:"not-found"}}).reason,"UNKNOWN_PRODUCT");
});
test("a supposedly paid event cannot overrule Crypto Congress HOLD",()=>{
  const result=assessEvent({id:"evt_fixture",type:"checkout.session.completed",data:{object:base}});
  assert.equal(result.verdict,"UNKNOWN");
  assert.equal(result.reason,"RELEASE_HOLD");
});
test("async failed and unhandled webhook never fulfill",()=>{
  assert.equal(assessEvent({id:"evt1",type:"charge.succeeded"}).verdict,"UNKNOWN");
  assert.equal(assessEvent({id:"evt2",type:"checkout.session.async_payment_failed"}).verdict,"FAIL");
  assert.equal(assessEvent({id:"evt3",type:"checkout.session.async_payment_succeeded",data:{object:base}}).reason,"RELEASE_HOLD");
});
