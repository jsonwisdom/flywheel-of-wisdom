import { createHash } from 'node:crypto';

// Cloudflare SQLite Durable Object storage interface: storage.sql.exec(sql,...bindings), storage.transactionSync(fn).
// No payment network access. The production public Worker must NEVER expose admin/seeding methods.
const sha256 = value => createHash('sha256').update(value).digest('hex');
const okId = x => typeof x === 'string' && /^[a-zA-Z0-9_:.-]{1,128}$/.test(x);
const int = x => Number.isSafeInteger(x) && x >= 0;

export class InventoryLedger {
  constructor(storage, {clock = () => new Date().toISOString(), verifySettlement} = {}) {
    if (!storage?.sql?.exec || !storage?.transactionSync) throw Error('SQLITE_TRANSACTIONAL_STORAGE_REQUIRED');
    this.storage = storage; this.clock = clock; this.verifySettlement = verifySettlement;
    for (const ddl of [
      "CREATE TABLE IF NOT EXISTS inventory (sku TEXT PRIMARY KEY, initial INTEGER NOT NULL CHECK(initial>=0), available INTEGER NOT NULL CHECK(available>=0), reserved INTEGER NOT NULL CHECK(reserved>=0), fulfilled INTEGER NOT NULL CHECK(fulfilled>=0), CHECK(initial=available+reserved+fulfilled))",
      "CREATE TABLE IF NOT EXISTS orders (order_id TEXT PRIMARY KEY, sku TEXT NOT NULL, qty INTEGER NOT NULL CHECK(qty>0), state TEXT NOT NULL CHECK(state IN ('RESERVED','SETTLED','FULFILLED','RELEASED')), payment_ref TEXT UNIQUE, delivery_ref TEXT UNIQUE)",
      "CREATE TABLE IF NOT EXISTS journal (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, sku TEXT NOT NULL, event_json TEXT NOT NULL, event_hash TEXT NOT NULL, prev_hash TEXT)"
    ]) this.run(ddl);
  }
  rows(sql,...p) { const result=this.storage.sql.exec(sql,...p); return typeof result.toArray==='function'?result.toArray():Array.from(result||[]); }
  run(sql,...p){this.rows(sql,...p)}
  transaction(fn){return this.storage.transactionSync(fn)}
  stock(sku){return this.rows('SELECT * FROM inventory WHERE sku=?',sku)[0]??null}
  order(orderId){return this.rows('SELECT * FROM orders WHERE order_id=?',orderId)[0]??null}
  events(){return this.rows('SELECT * FROM journal ORDER BY seq ASC')}
  duplicate(id,type,payload){
    const previous=this.rows('SELECT event_json FROM journal WHERE event_id=?',id)[0];
    if(!previous)return false;
    const prior=JSON.parse(previous.event_json);
    if(prior.type!==type || JSON.stringify(prior.payload)!==JSON.stringify(payload))throw Error('IDEMPOTENCY_COLLISION');
    return true;
  }
  append(id,type,sku,payload){
    if(!okId(id))throw Error('INVALID_EVENT_ID');
    const prev=this.rows('SELECT event_hash FROM journal ORDER BY seq DESC LIMIT 1')[0];
    const event={version:1,id,type,sku,payload,prevHash:prev?.event_hash??null,createdAt:this.clock()};
    const encoded=JSON.stringify(event),digest=sha256(encoded);
    this.run('INSERT INTO journal(event_id,sku,event_json,event_hash,prev_hash) VALUES(?,?,?,?,?)',id,sku,encoded,digest,event.prevHash);
    return {eventHash:digest,prevHash:event.prevHash};
  }
  create({sku,capacity,eventId}) {
    if(!okId(sku)||!int(capacity)||!okId(eventId))throw Error('BAD_INITIALIZATION');
    const payload={capacity};
    return this.transaction(()=>{
      if(this.duplicate(eventId,'INIT',payload))return this.snapshot(sku);
      if(this.rows('SELECT sku FROM inventory LIMIT 1').length)throw Error('STOCK_ALREADY_INITIALIZED');
      this.run('INSERT INTO inventory(sku,initial,available,reserved,fulfilled) VALUES(?,?,?,?,?)',sku,capacity,capacity,0,0);
      this.append(eventId,'INIT',sku,payload);return this.snapshot(sku);
    });
  }
  reserve({sku,orderId,qty,eventId}){
    if(!okId(sku)||!okId(orderId)||!okId(eventId)||!int(qty)||qty===0)throw Error('BAD_RESERVATION');
    const payload={orderId,qty};
    return this.transaction(()=>{
      if(this.duplicate(eventId,'RESERVE',payload))return this.snapshot(sku);
      const stock=this.stock(sku);
      if(!stock)throw Error('UNKNOWN_SKU');
      if(this.order(orderId))throw Error('ORDER_ALREADY_EXISTS');
      if(stock.available<qty)throw Error('INSUFFICIENT_STOCK');
      this.run('UPDATE inventory SET available=available-?, reserved=reserved+? WHERE sku=? AND available>=?',qty,qty,sku,qty);
      if(this.rows('SELECT changes() AS count')[0]?.count!==1)throw Error('ATOMIC_RESERVATION_CONFLICT');
      this.run('INSERT INTO orders(order_id,sku,qty,state) VALUES(?,?,?,?)',orderId,sku,qty,'RESERVED');
      this.append(eventId,'RESERVE',sku,payload);return this.snapshot(sku);
    });
  }
  release({orderId,eventId}){
    if(!okId(orderId)||!okId(eventId))throw Error('BAD_RELEASE');
    return this.transaction(()=>{
      const o=this.order(orderId);if(!o)throw Error('UNKNOWN_ORDER');
      const payload={orderId,qty:o.qty};
      if(this.duplicate(eventId,'RELEASE',payload))return this.snapshot(o.sku);
      if(o.state!=='RESERVED')throw Error('RELEASE_REQUIRES_UNPAID_RESERVATION');
      this.run('UPDATE orders SET state=? WHERE order_id=?','RELEASED',orderId);
      this.run('UPDATE inventory SET reserved=reserved-?,available=available+? WHERE sku=? AND reserved>=?',o.qty,o.qty,o.sku,o.qty);
      if(this.rows('SELECT changes() AS count')[0]?.count!==1)throw Error('RELEASE_CONFLICT');
      this.append(eventId,'RELEASE',o.sku,payload);return this.snapshot(o.sku);
    });
  }
  // Only trusted, server-side adapters may inject verifySettlement. Never accept JSON caller "verdict":"PASS" as authorization.
  settle({orderId,proof,eventId}) {
    if(!okId(orderId)||!okId(eventId))throw Error('BAD_SETTLEMENT');
    if(typeof this.verifySettlement!=='function')throw Error('INDEPENDENT_SETTLEMENT_VERIFIER_REQUIRED');
    return this.transaction(()=>{
      const o=this.order(orderId);if(!o)throw Error('UNKNOWN_ORDER');
      const certified=this.verifySettlement({order:{...o},proof}); // must be trusted synchronous adapter, never user-provided callback
      if(!certified||certified.verdict!=='PASS'||!okId(certified.paymentRef)||certified.orderId!==orderId||certified.sku!==o.sku)throw Error('SETTLEMENT_NOT_AUTHENTICATED');
      const payload={orderId,paymentRef:certified.paymentRef,rail:certified.rail??'UNKNOWN'};
      if(this.duplicate(eventId,'SETTLE',payload))return this.snapshot(o.sku);
      if(o.state!=='RESERVED')throw Error('ORDER_NOT_RESERVED');
      this.run('UPDATE orders SET state=?,payment_ref=? WHERE order_id=?','SETTLED',certified.paymentRef,orderId);
      this.append(eventId,'SETTLE',o.sku,payload);return this.snapshot(o.sku);
    });
  }
  fulfill({orderId,deliveryRef,eventId}) {
    if(!okId(orderId)||!okId(deliveryRef)||!okId(eventId))throw Error('BAD_FULFILLMENT');
    return this.transaction(()=>{
      const o=this.order(orderId);if(!o)throw Error('UNKNOWN_ORDER');
      const payload={orderId,qty:o.qty,deliveryRef};
      if(this.duplicate(eventId,'FULFILL',payload))return this.snapshot(o.sku);
      if(o.state!=='SETTLED')throw Error('FULFILLMENT_REQUIRES_SETTLEMENT');
      this.run('UPDATE orders SET state=?,delivery_ref=? WHERE order_id=?','FULFILLED',deliveryRef,orderId);
      this.run('UPDATE inventory SET reserved=reserved-?,fulfilled=fulfilled+? WHERE sku=? AND reserved>=?',o.qty,o.qty,o.sku,o.qty);
      if(this.rows('SELECT changes() AS count')[0]?.count!==1)throw Error('FULFILLMENT_CONFLICT');
      this.append(eventId,'FULFILL',o.sku,payload);return this.snapshot(o.sku);
    });
  }
  snapshot(sku){const s=this.stock(sku);if(!s)throw Error('UNKNOWN_SKU');return {...s,events:this.rows('SELECT count(*) AS count FROM journal')[0].count};}
  verifyBidirectional(sku){return this.transaction(()=>{
    const stock=this.stock(sku);if(!stock)throw Error('UNKNOWN_SKU');
    const journal=this.events(), model={initial:null,available:0,reserved:0,fulfilled:0,orders:new Map()};
    let previousHash=null;
    for(const j of journal){
      const ev=JSON.parse(j.event_json);
      if(j.prev_hash!==previousHash||ev.prevHash!==previousHash||sha256(j.event_json)!==j.event_hash||ev.id!==j.event_id||ev.sku!==j.sku)throw Error('JOURNAL_HASH_OR_LINK_MISMATCH');
      previousHash=j.event_hash;
      const p=ev.payload;
      if(ev.sku!==sku)throw Error('MULTI_SKU_NOT_SUPPORTED_BY_THIS_OBJECT');
      switch(ev.type){
        case 'INIT':if(model.initial!==null)throw Error('MULTIPLE_INIT');model.initial=p.capacity;model.available=p.capacity;break;
        case 'RESERVE':if(model.orders.has(p.orderId)||model.available<p.qty)throw Error('REPLAY_RESERVE_FAIL');model.orders.set(p.orderId,{qty:p.qty,state:'RESERVED'});model.available-=p.qty;model.reserved+=p.qty;break;
        case 'RELEASE':{const o=model.orders.get(p.orderId);if(!o||o.state!=='RESERVED'||o.qty!==p.qty)throw Error('REPLAY_RELEASE_FAIL');o.state='RELEASED';model.available+=p.qty;model.reserved-=p.qty;break;}
        case 'SETTLE':{const o=model.orders.get(p.orderId);if(!o||o.state!=='RESERVED')throw Error('REPLAY_SETTLE_FAIL');o.state='SETTLED';break;}
        case 'FULFILL':{const o=model.orders.get(p.orderId);if(!o||o.state!=='SETTLED'||o.qty!==p.qty)throw Error('REPLAY_FULFILL_FAIL');o.state='FULFILLED';model.reserved-=p.qty;model.fulfilled+=p.qty;break;}
        default:throw Error('REPLAY_BAD_EVENT');
      }
    }
    if(model.initial!==stock.initial||model.available!==stock.available||model.reserved!==stock.reserved||model.fulfilled!==stock.fulfilled)throw Error('FORWARD_REPLAY_DIVERGENCE');
    let [a,r,f]=[stock.available,stock.reserved,stock.fulfilled];
    for(const j of [...journal].reverse()){
      const ev=JSON.parse(j.event_json),p=ev.payload;
      if(ev.type==='RESERVE'){a+=p.qty;r-=p.qty}
      if(ev.type==='RELEASE'){a-=p.qty;r+=p.qty}
      if(ev.type==='FULFILL'){r+=p.qty;f-=p.qty}
      if(ev.type==='INIT'&&(a!==p.capacity||r!==0||f!==0))throw Error('REVERSE_REPLAY_DIVERGENCE');
    }
    return {verdict:'PASS',events:journal.length,head:previousHash,initial:stock.initial,available:stock.available,reserved:stock.reserved,fulfilled:stock.fulfilled,forward:true,reverse:true,externalAnchorVerified:false,signatureVerified:false,paymentVerified:false};
  })}
}
