async()=>{
 const databaseId="226ef881-d783-4115-bd78-958c0f7716c1",claim="UPDATE orders SET settlement_tx=?, settlement_log_index=?,\n receipt_sha256=?, state='PAYMENT_VERIFIED', updated_at=CURRENT_TIMESTAMP\n WHERE order_id=? AND state='CREATED' AND settlement_tx IS NULL\n AND product_id=? AND product_version=? AND artifact_hash=?\n AND amount_atomic=? AND chain_id=? AND payer_address=?";
 const query=async(sql,params=[])=>cloudflare.request({method:'POST',path:'/accounts/'+accountId+'/d1/database/'+databaseId+'/query',body:{sql,params}});
 const payer='0x'+'a'.repeat(40),artifact='c'.repeat(64),tx='0x'+'b'.repeat(64),hash='d'.repeat(64);
 const checks=[];const check=(name,ok,detail)=>{checks.push({name,verdict:ok?'PASS':'FAIL',detail});if(!ok)throw Error(name)};
 const seed=async(id)=>query("INSERT INTO orders(order_id,product_id,amount_atomic,chain_id,state,payer_address,product_version,artifact_hash) VALUES(?,'cwaas-verification-report',89000000,8453,'CREATED',?,'test-v1',?)",[id,payer,artifact]);
 const params=(id,txHash=tx,ver='test-v1')=>[txHash,7,hash,id,'cwaas-verification-report',ver,artifact,89000000,8453,payer];
 const changes=r=>r.result[0].meta.changes;
 await seed('native-1');await seed('native-2');await seed('native-race');await seed('native-wrong-version');
 check('conditional_claim',changes(await query(claim,params('native-1')))===1);
 check('repeated_claim_no_mutation',changes(await query(claim,params('native-1')))===0);
 let rejected=false;try{await query(claim,params('native-2'))}catch{rejected=true}
 check('duplicate_transfer_rejected',rejected);
 const unchanged=await query("SELECT state,settlement_tx FROM orders WHERE order_id='native-2'");
 check('duplicate_conflict_preserves_row',unchanged.result[0].results[0].state==='CREATED'&&unchanged.result[0].results[0].settlement_tx===null);
 check('wrong_version_no_mutation',changes(await query(claim,params('native-wrong-version','0x'+'e'.repeat(64),'wrong-version')))===0);
 const raceTx='0x'+'f'.repeat(64);const race=await Promise.all([query(claim,params('native-race',raceTx)),query(claim,params('native-race',raceTx))]);
 check('concurrent_claim_exactly_once',race.map(changes).sort().join(',')==='0,1',race.map(changes));
 rejected=false;try{await query("UPDATE orders SET product_version='tampered' WHERE order_id='native-1'")}catch{rejected=true}
 check('immutable_version_rejected',rejected);
 rejected=false;try{await query("INSERT INTO civic_replay_deliveries(delivery_id,order_id,product_id,product_version,artifact_hash,receipt_hash) VALUES('D-unpaid','native-2','cwaas-verification-report','test-v1',?,?)",[artifact,hash])}catch{rejected=true}
 check('unpaid_delivery_rejected',rejected);
 const integrity=await query('PRAGMA quick_check');check('native_integrity',integrity.result[0].results[0].quick_check==='ok');
 const fk=await query('PRAGMA foreign_key_check');check('foreign_keys',fk.result[0].results.length===0);
 return {observed_at:new Date().toISOString(),scope:'isolated remote D1 SQL only; synthetic order and receipt fixtures; no facilitator or Base network call',database_id:databaseId,checks};
}
