/**
 * A separately invoked second-fetch byte comparison of official source bodies.
 * A matching remote fetch proves byte consistency at two times, not an
 * independent human verifier, source truth, passage, or legal authority.
 * Zero network traffic without explicit --replay.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { captureSource } from "./capture-official-sources.mjs";

const hash = b => createHash("sha256").update(b).digest("hex");
export async function replayCaptures(map, receipt, dir, fetchImpl=fetch,
    { includeRelated=false }={}) {
  if (receipt?.schema_version!=="jaywisdom_official_capture.v1" ||
      !Array.isArray(receipt.results)) throw Error("INVALID_CAPTURE_RECEIPT");
  const sources=includeRelated?[...map.slots,...(map.related_sources??[])]:map.slots;
  const recorded=new Map(receipt.results.map(x=>[x.slot_id,x]));
  if (!sources.length || new Set(sources.map(x=>x.id)).size!==sources.length ||
      new Set(receipt.results.map(x=>x.slot_id)).size!==receipt.results.length)
    throw Error("DUPLICATE_OR_MISSING_SOURCE_MAPPING");
  const replay=[];
  for (const source of sources) {
    const entry=recorded.get(source.id);
    if (!entry || entry.status!=="CAPTURED_UNREPLAYED" ||
        entry.url!==source.url || !/^[0-9a-f]{64}$/.test(entry.sha256??"")) {
      replay.push({slot_id:source.id,status:"UNKNOWN",reason:"NO_VALID_CAPTURE_RECEIPT"});
      continue;
    }
    let bytes;
    try {bytes=await readFile(join(dir,source.id+".raw"));}
    catch {replay.push({slot_id:source.id,status:"UNKNOWN",reason:"CAPTURED_BYTES_NOT_ACCESSIBLE"});continue;}
    const localHash=hash(bytes);
    if (localHash!==entry.sha256) {
      replay.push({slot_id:source.id,status:"FAIL",reason:"CAPTURED_BYTES_RECEIPT_MISMATCH",
        stored_sha256:entry.sha256,actual_local_sha256:localHash});
      continue;
    }
    const second=await captureSource(source,fetchImpl);
    if (second.status!=="CAPTURED_UNREPLAYED") {
      replay.push({slot_id:source.id,status:"UNKNOWN",reason:"SECOND_FETCH_UNAVAILABLE",
        second_fetch_status:second.status,second_fetch_reason:second.reason});
      continue;
    }
    const match=second.sha256===entry.sha256;
    replay.push({slot_id:source.id,status:match?"MATCH":"UNKNOWN",
      reason:match?"EXACT_SECOND_FETCH_HASH_MATCH":"OFFICIAL_RESPONSE_BYTES_CHANGED",
      original_capture_sha256:entry.sha256,second_fetch_sha256:second.sha256});
  }
  return {
    schema_version:"jaywisdom_second_fetch_replay.v1",replay,
    matched:replay.filter(x=>x.status==="MATCH").length,
    failed_local_integrity:replay.filter(x=>x.status==="FAIL").length,
    expected:sources.length, independent_verifier_confirmed:false,
    historical_digest_recovered:false,authority_created:false,production:"HOLD"
  };
}
const invoked=process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked) {
  const home=dirname(fileURLToPath(import.meta.url));
  if (!["--replay","--replay-all"].includes(process.argv[2])) {
    console.log(JSON.stringify({mode:"NO_NETWORK_PLAN",usage:"--replay or --replay-all",
      independent_verifier_confirmed:false,production:"HOLD"}));
  } else {
    const map=JSON.parse(await readFile(join(home,"expectations/hr3633-official-source-map.v1.json"),"utf8"));
    const input=join(home,".audit-artifacts/official-inputs");
    const receipts=JSON.parse(await readFile(join(input,"capture-receipts.json"),"utf8"));
    const includeRelated=process.argv[2]==="--replay-all";
    const result=await replayCaptures(map,receipts,input,fetch,{includeRelated});
    await writeFile(join(input,"second-fetch-replay.json"),JSON.stringify(result,null,2)+"\n");
    console.log(JSON.stringify({matched:result.matched,expected:result.expected,
      independent_verifier_confirmed:false,production:"HOLD"}));
    if(result.matched!==result.expected)process.exitCode=2;
  }
}
