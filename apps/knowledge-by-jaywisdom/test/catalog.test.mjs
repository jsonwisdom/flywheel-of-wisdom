import test from "node:test";
import assert from "node:assert/strict";
import { CATALOG, getProduct, catalogPreview, isReleaseReady } from "../catalog.mjs";
test("public catalog has HOLD-first products", () => {
  assert.equal(CATALOG.length,2);
  assert.deepEqual(CATALOG.map(x=>x.id),["evidence-replay-method-v1","crypto-congress-audit-v1"]);
  assert.ok(CATALOG.every(x=>x.release_state==="HOLD"));
  assert.ok(CATALOG.every(x=>x.content_sha256===null));
  assert.ok(catalogPreview().every(x=>x.authority_created===false));
});
test("no entitlement from a missing or unbound product",()=>{
  assert.equal(getProduct("bad"),null);
  assert.equal(isReleaseReady(getProduct("crypto-congress-audit-v1")),false);
  assert.equal(isReleaseReady({...getProduct("crypto-congress-audit-v1"),release_state:"RELEASED",content_sha256:"x"}),false);
});
