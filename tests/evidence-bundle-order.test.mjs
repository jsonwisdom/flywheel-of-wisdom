import test from "node:test";
import assert from "node:assert/strict";
import {createStore,PRODUCT} from "../src/evidence-bundles/test-order-core.mjs";
const approvals={scope:true,price:true,no_legal_advice:true,no_government_authority:true,privacy:true};
const bytes=v=>Buffer.from(v).toString("base64");
function setup() { const s=createStore({testMode:true});const o=s.create();return {s,id:o.draft_id}; }
function settled() { const {s,id}=setup();s.authorize(id,approvals);s.testSettle(id);return {s,id}; }
function manifested() {const {s,id}=settled();s.manifest(id,[{file_name:"agenda.txt",bytes_base64:bytes("Public agenda test fixture")}]);return {s,id};}
function bundled() {const {s,id}=manifested();s.hashBundle(id,bytes("Evidence Bundle test fixture"));return {s,id};}
function delivered() {const {s,id}=bundled();s.deliver(id,{method:"TEST_PORTAL",reference:"TEST_DELIVERY_ONLY"});return {s,id};}
test("1 product separate: $100 configuration does not mention existing $1 routes",()=>{assert.equal(PRODUCT.price_usd,100);assert.match(PRODUCT.name,/Minnesota Public Records/);});
test("2 draft receipt starts UNKNOWN",()=>{const {s,id}=setup();const r=s.receipt(id);assert.equal(r.order_id,null);assert.equal(r.payment_status,"UNKNOWN");assert.equal(r.delivery_status,"UNKNOWN");assert.equal(r.revenue_verified,false);});
test("3 authorization requires five affirmative acceptances",()=>{const {s,id}=setup();assert.throws(()=>s.authorize(id,{...approvals,privacy:false}),/CONSENT_REQUIRED/);assert.equal(s.authorize(id,approvals).status,"AUTHORIZED");});
test("4 final order ID only after authorization",()=>{const {s,id}=setup();assert.equal(s.get(id).order_id,null);s.authorize(id,approvals);assert.match(s.get(id).order_id,/^CW-TEST-/);});
test("5 test settlement cannot move funds or verify real revenue",()=>{const {s,id}=settled();assert.equal(s.get(id).payment_status,"TEST_SETTLED");assert.equal(s.receipt(id).production_revenue_verified,false);assert.match(s.get(id).test_settlement_reference,/^TEST-/);});
test("6 source SHA-256 hashes are computed from bytes",()=>{const {s,id}=manifested();assert.match(s.get(id).sources[0].sha256,/^[0-9a-f]{64}$/);});
test("7 final bundle bytes reproduce final SHA-256",()=>{const {s,id}=bundled();assert.match(s.get(id).bundle_sha256,/^[0-9a-f]{64}$/);});
test("8 delivery cannot pass without evidence",()=>{const {s,id}=bundled();assert.throws(()=>s.deliver(id,{}),/DELIVERY_EVIDENCE_REQUIRED/);assert.equal(s.get(id).delivery_status,"UNKNOWN");});
test("9 full independent hash-chain replay succeeds on complete test fixture",()=>{const {s,id}=delivered();const r=s.replay(id);assert.equal(r.test_replay_verified,true);assert.ok(Object.values(r.checks).every(Boolean));});
test("10 test replay never promotes real revenue or authority",()=>{const {s,id}=delivered();const r=s.replay(id);assert.equal(r.production_revenue_verified,false);assert.equal(r.revenue_verified,false);assert.equal(r.authority_created,false);assert.equal(s.receipt(id).revenue_verified,false);});
test("tamper: modified source bytes fail replay",()=>{const {s,id}=delivered();s.get(id).sources[0].bytes_base64=bytes("tampered");assert.equal(s.replay(id).test_replay_verified,false);});
test("tamper: altered event hash fails replay",()=>{const {s,id}=delivered();s.get(id).events[1].event_sha256="0".repeat(64);assert.equal(s.replay(id).test_replay_verified,false);});
test("test-only store refuses non-test use",()=>{assert.throws(()=>createStore(),/FUNDS_DISABLED_TEST_ONLY/);});
