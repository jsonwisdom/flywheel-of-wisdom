import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { validateSource, captureSource, captureMap } from "../capture-official-sources.mjs";

const sourceMap={
  schema_version:"jaywisdom_official_source_map.v1",
  slots:[
    {id:"congress_bill",url:"https://www.govinfo.gov/content/pkg/BILLS-119hr3633eh/html/BILLS-119hr3633eh.htm",expected_content_sha256:null,record_id:"BILLS-119hr3633eh"},
    {id:"congressional_actions",url:"https://www.govinfo.gov/app/details/BILLS-119hr3633rfs",expected_content_sha256:null,record_id:"BILLS-119hr3633rfs"},
    {id:"house_vote",url:"https://clerk.house.gov/Votes/2025199",expected_content_sha256:null,record_id:"119-1-roll199"}
  ]
};
const bytes=Buffer.from("<record>fixture ONLY</record>","utf8");
const h=bytes=>createHash("sha256").update(bytes).digest("hex");
const fakeFetch=async (_url,options)=>{
  assert.equal(options.method,"GET");
  assert.equal(options.redirect,"error");
  return new Response(bytes,{status:200,headers:{"content-type":"application/xml"}});
};
test("official source allowlist rejects injected hosts and userinfo",()=>{
  assert.equal(validateSource(sourceMap.slots[0]).hostname,"www.govinfo.gov");
  assert.throws(()=>validateSource({...sourceMap.slots[0],url:"https://evil.example/" }),/UNAPPROVED_OFFICIAL_URL/);
  assert.throws(()=>validateSource({...sourceMap.slots[0],url:"https://clerk.house.gov@evil.example/Votes/" }),/UNAPPROVED_OFFICIAL_URL/);
});
test("capture hashes exact raw bytes; capture is not replay or truth",async()=>{
  const x=await captureSource(sourceMap.slots[0],fakeFetch);
  assert.equal(x.status,"CAPTURED_UNREPLAYED");
  assert.equal(x.sha256,h(bytes));
  assert.deepEqual(x.data,bytes);
});
test("capture fails closed on digest mismatch, does not return original bytes",async()=>{
  const x=await captureSource({...sourceMap.slots[0],expected_content_sha256:"0".repeat(64)},fakeFetch);
  assert.equal(x.status,"FAIL");
  assert.equal(x.reason,"SOURCE_HASH_MISMATCH");
  assert.equal(x.data,null);
});
test("HTTP 500 and network failures become UNKNOWN, not ABSENT",async()=>{
  const a=await captureSource(sourceMap.slots[0],async()=>new Response("fail",{status:500}));
  assert.equal(a.status,"UNKNOWN");
  const b=await captureSource(sourceMap.slots[0],async()=>{throw Error("network");});
  assert.equal(b.status,"UNKNOWN");
});
test("three raw captures and receipts replay against independently recalculated bytes",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"jw-official-fixture-"));
  try {
    const receipt=await captureMap(sourceMap,fakeFetch,dir);
    assert.equal(receipt.original_count,3);
    assert.equal(receipt.independent_replay_count,0);
    for (const item of receipt.results) {
      const raw=await readFile(join(dir,item.slot_id+".raw"));
      assert.equal(item.sha256,h(raw));
      assert.equal(item.status,"CAPTURED_UNREPLAYED");
      assert.equal(item.authority_created,false);
      assert.equal(item.independent_replay,false);
    }
  } finally {await rm(dir,{recursive:true,force:true});}
});
