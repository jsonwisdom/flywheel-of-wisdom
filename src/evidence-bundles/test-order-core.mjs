import { createHash, randomUUID } from "node:crypto";

export const PRODUCT = Object.freeze({ name: "Minnesota Public Records Starter Packet", price_usd: 100 });
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const canonical = value => JSON.stringify(sort(value));
function sort(v) {
  if (Array.isArray(v)) return v.map(sort);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map(k => [k,sort(v[k])]));
  return v;
}
function invariant(ok, message) { if (!ok) throw new Error(message); }
export function createStore({testMode = false} = {}) {
  invariant(testMode, "FUNDS_DISABLED_TEST_ONLY");
  const orders = new Map();
  function event(order, type, evidence) {
    const prev = order.events.at(-1)?.event_sha256 ?? null;
    const record = {schema_version:"1.0", event_id:randomUUID(), draft_id:order.draft_id,
      order_id:order.order_id, event_type:type, event_time:new Date().toISOString(),
      actor:"funds-disabled-test-adapter", evidence, previous_event_sha256:prev};
    const sealed = {...record,event_sha256:sha(Buffer.from(canonical(record)))};
    order.events.push(sealed);
    return sealed;
  }
  function get(id) { const o=orders.get(id); invariant(o,"DRAFT_NOT_FOUND"); return o; }
  function create() {
    const o = {draft_id:randomUUID(),order_id:null,product:PRODUCT,status:"DRAFT",
      payment_status:"UNKNOWN",delivery_status:"UNKNOWN",revenue_verified:false,
      authority_created:false,events:[],sources:[],bundle_bytes:null,bundle_sha256:null,
      delivery_receipt:null,test_settlement_reference:null};
    orders.set(o.draft_id,o);
    event(o,"PRODUCT_DRAFT_CREATED",{product:PRODUCT});
    return o;
  }
  function transition(id, expected, next, name, evidence, apply=()=>{}) {
    const o=get(id); invariant(o.status===expected,"INVALID_TRANSITION");
    apply(o);o.status=next;event(o,name,evidence);return o;
  }
  function authorize(id, approvals) {
    invariant(["scope","price","no_legal_advice","no_government_authority","privacy"].every(k=>approvals?.[k]===true),"CONSENT_REQUIRED");
    return transition(id,"DRAFT","AUTHORIZED","ORDER_AUTHORIZED",{approvals,product:PRODUCT},o=>{o.order_id="CW-TEST-"+randomUUID();});
  }
  function testSettle(id) {
    const o=get(id);const ref="TEST-"+randomUUID();
    return transition(id,"AUTHORIZED","TEST_SETTLED","TEST_SETTLEMENT_CONFIRMED",
      {mode:"TEST",funds_moved:false,test_settlement_reference:ref,production_revenue:false},
      o=>{o.payment_status="TEST_SETTLED";o.test_settlement_reference=ref;});
  }
  function manifest(id, documents) {
    invariant(Array.isArray(documents)&&documents.length>0&&documents.length<=5,"INVALID_DOCUMENT_COUNT");
    const sources=documents.map(d=>{
      invariant(typeof d.file_name==="string"&&typeof d.bytes_base64==="string"&&/^[A-Za-z0-9+/]*={0,2}$/.test(d.bytes_base64),"INVALID_SOURCE");
      const bytes=Buffer.from(d.bytes_base64,"base64");
      invariant(bytes.length>0&&bytes.length<=2_000_000,"SOURCE_SIZE");
      return {file_name:d.file_name,sha256:sha(bytes),bytes_base64:d.bytes_base64,source_url:d.source_url??null};
    });
    return transition(id,"TEST_SETTLED","MANIFEST_CREATED","BUNDLE_MANIFEST_CREATED",
      {sources:sources.map(({bytes_base64,...s})=>s)},o=>{o.sources=sources;});
  }
  function hashBundle(id, bytes_base64) {
    invariant(typeof bytes_base64==="string"&&/^[A-Za-z0-9+/]*={0,2}$/.test(bytes_base64),"INVALID_BUNDLE");
    const bytes=Buffer.from(bytes_base64,"base64");invariant(bytes.length>0&&bytes.length<=5_000_000,"BUNDLE_SIZE");
    const digest=sha(bytes);
    return transition(id,"MANIFEST_CREATED","BUNDLE_HASHED","FINAL_BUNDLE_HASHED",{bundle_sha256:digest},
      o=>{o.bundle_bytes=Buffer.from(bytes);o.bundle_sha256=digest;});
  }
  function deliver(id, receipt) {
    invariant(typeof receipt?.method==="string"&&typeof receipt?.reference==="string"&&receipt.reference.trim().length>0,"DELIVERY_EVIDENCE_REQUIRED");
    return transition(id,"BUNDLE_HASHED","DELIVERED","TEST_DELIVERY_EVIDENCE_RECORDED",
      {receipt,mode:"TEST"},o=>{o.delivery_status="TEST_DELIVERED";o.delivery_receipt=receipt;});
  }
  function replay(id) {
    const o=get(id);
    let previous=null;
    const chain_valid=o.events.every(e=>{
      const {event_sha256,...raw}=e;
      const ok=e.previous_event_sha256===previous&&sha(Buffer.from(canonical(raw)))===event_sha256;
      previous=event_sha256;return ok;
    });
    const eventTypes=o.events.map(e=>e.event_type);
    const required=["PRODUCT_DRAFT_CREATED","ORDER_AUTHORIZED","TEST_SETTLEMENT_CONFIRMED","BUNDLE_MANIFEST_CREATED","FINAL_BUNDLE_HASHED","TEST_DELIVERY_EVIDENCE_RECORDED"];
    const sequence_ok=required.every((name,i)=>eventTypes[i]===name);
    const sources_valid=o.sources.length>0&&o.sources.every(s=>sha(Buffer.from(s.bytes_base64,"base64"))===s.sha256);
    const bundle_valid=!!o.bundle_bytes&&sha(o.bundle_bytes)===o.bundle_sha256;
    const authorized=!!o.order_id&&eventTypes.includes("ORDER_AUTHORIZED");
    const settlement=o.payment_status==="TEST_SETTLED"&&!!o.test_settlement_reference&&eventTypes.includes("TEST_SETTLEMENT_CONFIRMED");
    const delivery=o.delivery_status==="TEST_DELIVERED"&&!!o.delivery_receipt?.reference&&eventTypes.includes("TEST_DELIVERY_EVIDENCE_RECORDED");
    const pass=chain_valid&&sequence_ok&&sources_valid&&bundle_valid&&authorized&&settlement&&delivery&&o.status==="DELIVERED";
    if(pass){o.status="TEST_REPLAY_VERIFIED";event(o,"TEST_REPLAY_CHECK_PASSED",{chain_valid,sequence_ok,sources_valid,bundle_valid,authorized,settlement,delivery,production_revenue:false});}
    return {test_replay_verified:pass,production_revenue_verified:false,revenue_verified:false,authority_created:false,
      checks:{chain_valid,sequence_ok,sources_valid,bundle_valid,authorized,settlement,delivery}};
  }
  function receipt(id) {
    const o=get(id);
    return {schema_version:"1.0",service:"Computer Wisdom Evidence Bundle",product_name:PRODUCT.name,
      price_usd:100,order_id:o.order_id,payment_status:o.payment_status,delivery_status:o.delivery_status,
      bundle_sha256:o.bundle_sha256,delivery_receipt:o.delivery_receipt,test_replay_verified:o.status==="TEST_REPLAY_VERIFIED",
      production_revenue_verified:false,revenue_verified:false,authority_created:false};
  }
  return {create,get,authorize,testSettle,manifest,hashBundle,deliver,replay,receipt};
}
