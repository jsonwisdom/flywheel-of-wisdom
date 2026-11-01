import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSETS, ONE_USDC_ATOMIC, decodePaymentRequired, auditChallenge, probeChallenge, validateTarget } from './x402-challenge-audit.mjs';

const RECEIVER = '0xa380552a27b0a5a2874ea7aa52cac09f542002e8';
const network = 'eip155:8453';
const opts = {network, receiver:RECEIVER};
function challenge(overrides = {}) {
  return {x402Version:2, resource:{url:'https://api.jsonwisdom.com/knowledge'},accepts:[{scheme:'exact',network,asset:ASSETS[network],amount:'1000000',payTo:RECEIVER,maxTimeoutSeconds:60, ...overrides}]};
}
function expectCode(fn, code) {assert.throws(fn, e => e.message === code);}

test('accepts documented x402 v2 terms for exactly 1 USDC',()=>{
  const v = auditChallenge(challenge(),opts);
  assert.equal(v.amount_atomic,'1000000'); assert.equal(v.amount_usdc,'1.000000');
  assert.equal(v.funds_moved,false); assert.equal(v.settlement_verified,false);
});
test('rejects v1 maxAmountRequired (v2 amount absent)',()=>{
  expectCode(()=>auditChallenge(challenge({amount:undefined,maxAmountRequired:'1000000'}),opts),'PRICE_MISMATCH_OR_INVALID');
});
test('wrong network rejected',()=> expectCode(()=>auditChallenge(challenge({network:'eip155:84532'}),opts),'NO_ALLOWED_NETWORK_TOKEN_RECEIVER_SCHEME'));
test('wrong token contract rejected',()=> expectCode(()=>auditChallenge(challenge({asset:'0x1111111111111111111111111111111111111111'}),opts),'NO_ALLOWED_NETWORK_TOKEN_RECEIVER_SCHEME'));
test('wrong recipient rejected',()=> expectCode(()=>auditChallenge(challenge({payTo:'0x1111111111111111111111111111111111111111'}),opts),'NO_ALLOWED_NETWORK_TOKEN_RECEIVER_SCHEME'));
test('wrong scheme rejected',()=> expectCode(()=>auditChallenge(challenge({scheme:'upto'}),opts),'NO_ALLOWED_NETWORK_TOKEN_RECEIVER_SCHEME'));
test('excess price rejected',()=> expectCode(()=>auditChallenge(challenge({amount:'1000001'}),opts),'PRICE_MISMATCH_OR_INVALID'));
test('zero price rejected',()=> expectCode(()=>auditChallenge(challenge({amount:'0'}),opts),'PRICE_MISMATCH_OR_INVALID'));
test('wrong price below $1 rejected (product requires exactly $1)',()=> expectCode(()=>auditChallenge(challenge({amount:'999999'}),opts),'PRICE_MISMATCH_OR_INVALID'));
test('wrong x402 version rejected',()=> expectCode(()=>auditChallenge({...challenge(),x402Version:1},opts),'REQUIRES_X402_V2'));
test('invalid timeout rejected',()=> expectCode(()=>auditChallenge(challenge({maxTimeoutSeconds:0}),opts),'TIMEOUT_INVALID'));
test('malformed base64 rejected',()=> expectCode(()=>decodePaymentRequired('!!!bad!!!'),'INVALID_CHALLENGE_BASE64'));
test('proper base64 decodes as x402 v2',()=>{
  const input=Buffer.from(JSON.stringify(challenge())).toString('base64');
  assert.equal(decodePaymentRequired(input).accepts[0].amount,'1000000');
});
test('Base Sepolia USDC allowed only with Sepolia network',()=>{
  const sepolia='eip155:84532';
  const valid=auditChallenge(challenge({network:sepolia,asset:ASSETS[sepolia]}),{network:sepolia,receiver:RECEIVER});
  assert.equal(valid.network,sepolia);assert.equal(valid.amount_atomic,ONE_USDC_ATOMIC.toString());
});
test('remote HTTP target rejected',()=>expectCode(()=>validateTarget('http://api.jsonwisdom.com/receipt'),'HTTPS_REQUIRED_FOR_REMOTE_TARGET'));
test('localhost HTTP allowed for dev',()=>assert.equal(validateTarget('http://localhost:8402/receipt').hostname,'localhost'));
test('probe requires 402 and returns no payment', async()=>{
  const h=new Headers({'PAYMENT-REQUIRED':Buffer.from(JSON.stringify(challenge())).toString('base64')});
  const probe=await probeChallenge('https://api.jsonwisdom.com/knowledge',opts,async()=>({status:402,headers:h}));
  assert.equal(probe.http_status,402);assert.equal(probe.payment_signed,false);
});
test('probe rejects HTTP 200 without 402',async()=>{
  await assert.rejects(probeChallenge('https://api.jsonwisdom.com/knowledge',opts,async()=>({status:200,headers:new Headers()})),/EXPECTED_HTTP_402_GOT_200/);
});
