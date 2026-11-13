/**
 * Read-only PC USDC transfer check. Never signs, sends, charges, or confirms
 * an x402 request. Two distinct HTTPS RPC sources are required for PASS.
 *
 * node scripts/audit/verify-pc-base-transfer.mjs --tx 0x... \
 *   --rpc-a https://mainnet.base.org --rpc-b https://other-provider.example
 */
import {verifyPcBaseTransfer,makeBaseRpcReader} from '../../src/payment/pc-base-receipt-verifier.mjs';
const argv=process.argv.slice(2);
const readArg=(name)=>{const i=argv.indexOf(name);return i>=0?argv[i+1]:undefined;};
if(argv.length!==6||!['--tx','--rpc-a','--rpc-b'].every(k=>argv.includes(k))) {
 console.log(JSON.stringify({status:'UNKNOWN',reason:'EXPLICIT_TX_AND_TWO_RPC_URLS_REQUIRED',
   payment_settlement_verified:false,authority_created:false}));
 process.exitCode=2;
} else {
 const tx=readArg('--tx'),a=readArg('--rpc-a'),b=readArg('--rpc-b');
 try {
  const ra=makeBaseRpcReader(a),rb=makeBaseRpcReader(b);
  if(new URL(a).origin===new URL(b).origin)throw Error('RPC_ORIGINS_NOT_DISTINCT');
  const result=await verifyPcBaseTransfer(tx,[ra,rb]);
  console.log(JSON.stringify({schema:'computerwisdom.pc-base-transfer-readback.v1',...result},null,2));
  process.exitCode=result.status==='PASS'?0:result.status==='FAIL'?1:2;
 } catch(e) {
  console.log(JSON.stringify({status:'UNKNOWN',reason:'RPC_CONFIGURATION_INVALID',
    payment_settlement_verified:false,authority_created:false}));
  process.exitCode=2;
 }
}
