import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { captureMap } from "../capture-official-sources.mjs";
import { replayCaptures } from "../verify-official-sources.mjs";
const map={
  schema_version:"jaywisdom_official_source_map.v1",
  slots:[
    {id:"congress_bill",url:"https://www.govinfo.gov/content/pkg/BILLS-119hr3633eh/html/BILLS-119hr3633eh.htm",
      expected_content_sha256:null},
    {id:"congressional_actions",url:"https://www.senate.gov/legislative/LIS/floor_activity/09_15_2026_Senate_Floor.htm",
      expected_content_sha256:null},
    {id:"house_vote",url:"https://clerk.house.gov/Votes/2025199",expected_content_sha256:null}
  ],
  related_sources:[
    {id:"senate_reported_text",url:"https://www.govinfo.gov/content/pkg/BILLS-119hr3633rs/html/BILLS-119hr3633rs.htm",
      expected_content_sha256:null},
    {id:"senate_cloture_vote",
      url:"https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00234.htm",
      expected_content_sha256:null}
  ]
};
const fetchFixture=async ()=>new Response("<html>fixture source bytes only</html>",{status:200});
const changedFetch=async ()=>new Response("<html>changed source bytes</html>",{status:200});
async function fixture(fn) {
  const dir=await mkdtemp(join(tmpdir(),"jw-second-fetch-"));
  try {
    const receipt=await captureMap(map,fetchFixture,dir,{includeRelated:true});
    await fn(dir,receipt);
  } finally {await rm(dir,{recursive:true,force:true});}
}
test("separate fetch matching all five byte receipts does not create independent authority",()=>fixture(async (dir,r)=>{
  const out=await replayCaptures(map,r,dir,fetchFixture,{includeRelated:true});
  assert.equal(out.expected,5);
  assert.equal(out.matched,5);
  assert.equal(out.independent_verifier_confirmed,false);
  assert.equal(out.authority_created,false);
  assert.equal(out.production,"HOLD");
}));
test("tampered first capture fails local receipt integrity",()=>fixture(async (dir,r)=>{
  await writeFile(join(dir,"house_vote.raw"),"tampered");
  const out=await replayCaptures(map,r,dir,fetchFixture,{includeRelated:true});
  assert.equal(out.failed_local_integrity,1);
  assert.equal(out.replay.find(x=>x.slot_id==="house_vote").reason,"CAPTURED_BYTES_RECEIPT_MISMATCH");
}));
test("remote bytes changed is UNKNOWN, never alleged source absence",()=>fixture(async (dir,r)=>{
  const out=await replayCaptures(map,r,dir,changedFetch,{includeRelated:false});
  assert.equal(out.matched,0);
  assert.equal(out.failed_local_integrity,0);
  assert.ok(out.replay.every(x=>x.status==="UNKNOWN"));
}));
test("network challenge in second fetch remains UNKNOWN",()=>fixture(async (dir,r)=>{
  const challenge=async()=>new Response("<html>Just a moment... cf-chl-403</html>",{status:200});
  const out=await replayCaptures(map,r,dir,challenge);
  assert.equal(out.matched,0);
  assert.ok(out.replay.every(x=>x.reason==="SECOND_FETCH_UNAVAILABLE"));
}));
test("missing bytes are UNKNOWN despite retained capture receipt",()=>fixture(async (dir,r)=>{
  const { unlink }=await import("node:fs/promises");
  await unlink(join(dir,"house_vote.raw"));
  const out=await replayCaptures(map,r,dir,fetchFixture);
  assert.equal(out.replay.find(x=>x.slot_id==="house_vote").status,"UNKNOWN");
}));
