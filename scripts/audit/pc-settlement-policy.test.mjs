import test from "node:test";
import assert from "node:assert/strict";
import {PC_SETTLEMENT_RECEIVER,BASE_NATIVE_USDC,ONE_USDC_ATOMIC,requirePcPayee,assessPcSettlementEvidence,holdLegacyMainnetLaunch} from "../../src/payment/pc-settlement-policy.mjs";
const LEGACY="0xA380552a27b0a5a2874Ea7AA52CAC09f542002E8";
const TX="0x"+"12".repeat(32);
const pass={tx_hash:TX,chain_id:8453,token_address:BASE_NATIVE_USDC,amount_base_units:ONE_USDC_ATOMIC,pay_to:PC_SETTLEMENT_RECEIVER,receipt_status:1,verified_on_chain:true,request_bound:true,durable_booking:true};
test("PC payee candidate accepts only exact requested wallet",()=>{
 assert.equal(requirePcPayee(PC_SETTLEMENT_RECEIVER.toLowerCase()),PC_SETTLEMENT_RECEIVER);
 assert.throws(()=>requirePcPayee(LEGACY),/PAYEE_MISMATCH/);
 assert.throws(()=>requirePcPayee(undefined),/INVALID_PC_RECEIVER/);
});
test("missing or invalid transaction never passes",()=>{
 assert.equal(assessPcSettlementEvidence({...pass,tx_hash:null}).status,"UNKNOWN");
 assert.equal(assessPcSettlementEvidence({...pass,tx_hash:"0xdead"}).status,"UNKNOWN");
});
test("wrong chain, currency, amount, recipient fail",()=>{
 for(const field of ["chain_id","token_address","amount_base_units","pay_to"]){
   const bad={...pass,[field]:field==="chain_id"?1:field==="pay_to"?LEGACY:"WRONG"};
   assert.equal(assessPcSettlementEvidence(bad).status,"FAIL",field);
 }
});
test("no chain receipt or reconciliation is UNKNOWN",()=>{
 for(const field of ["verified_on_chain","request_bound","durable_booking"]){
  assert.equal(assessPcSettlementEvidence({...pass,[field]:false}).status,"UNKNOWN",field);
 }
 assert.equal(assessPcSettlementEvidence({...pass,receipt_status:0}).status,"UNKNOWN");
});
test("all candidate predicates match but do not authenticate source",()=>{
 assert.equal(assessPcSettlementEvidence(pass).status,"PASS");
 assert.match(assessPcSettlementEvidence(pass).reason,/TRUSTED_PROVENANCE/);
});
test("legacy paid route MUST stop before charging",()=>{
 assert.throws(()=>holdLegacyMainnetLaunch(),/CI_FIRST_HOLD/);
});
