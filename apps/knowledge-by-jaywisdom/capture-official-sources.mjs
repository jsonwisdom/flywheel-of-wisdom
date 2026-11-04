/**
 * Manual official-source capture, NOT a networked CI assertion.
 * Stores exact HTTP body bytes and SHA-256 for later independent replay.
 * No original bytes, no capture PASS; not evidence of legislation's truth.
 */
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sha256=buf=>createHash("sha256").update(buf).digest("hex");
const OFFICIAL_HOSTS=new Set(["www.govinfo.gov","clerk.house.gov"]);
export function validateSource(slot) {
  if (!/^(congress_bill|congressional_actions|house_vote)$/.test(slot?.id ?? ""))
    throw Error("UNEXPECTED_SOURCE_ID");
  const u=new URL(slot.url);
  if (u.protocol!=="https:" || !OFFICIAL_HOSTS.has(u.hostname) ||
      u.username || u.password || u.search || u.hash) throw Error("UNAPPROVED_OFFICIAL_URL");
  if (slot.expected_content_sha256 !== null &&
      !/^[0-9a-fA-F]{64}$/.test(slot.expected_content_sha256)) throw Error("BAD_EXPECTED_DIGEST");
  return u;
}
export async function captureSource(slot, fetchImpl=fetch) {
  validateSource(slot);
  let response;
  try {
    response=await fetchImpl(slot.url,{method:"GET",redirect:"error",
      headers:{"Accept":"text/html,application/xml,text/xml,*/*"},
      signal:AbortSignal.timeout(20000)});
  } catch {
    return {status:"UNKNOWN",reason:"OFFICIAL_SOURCE_FETCH_UNAVAILABLE",data:null};
  }
  if (!response.ok || !response.body)
    return {status:"UNKNOWN",reason:"OFFICIAL_SOURCE_HTTP_UNAVAILABLE",http_status:response.status,data:null};
  const type=response.headers?.get?.("content-type")??"unknown";
  const maxBytes=12*1024*1024;
  const chunks=[];let length=0;
  try {
    for await (const chunk of response.body) {
      const buf=Buffer.from(chunk);
      length+=buf.byteLength;
      if (length>maxBytes) return {status:"FAIL",reason:"SOURCE_BYTES_TOO_LARGE",data:null};
      chunks.push(buf);
    }
  } catch {
    return {status:"UNKNOWN",reason:"SOURCE_STREAM_INCOMPLETE",data:null};
  }
  const data=Buffer.concat(chunks);
  if (!data.byteLength) return {status:"UNKNOWN",reason:"EMPTY_HTTP_BODY",data:null};
  const digest=sha256(data);
  if (slot.expected_content_sha256 && slot.expected_content_sha256.toLowerCase()!==digest)
    return {status:"FAIL",reason:"SOURCE_HASH_MISMATCH",observed_sha256:digest,data:null};
  return {
    status:"CAPTURED_UNREPLAYED",reason:"ORIGINAL_RAW_BYTES_CAPTURED_NOT_INDEPENDENTLY_REPLAYED",
    data,sha256:digest,byte_length:data.byteLength,content_type:type
  };
}
export async function captureMap(sourceMap, fetchImpl=fetch, outputDir) {
  if (!sourceMap || sourceMap.schema_version!=="jaywisdom_official_source_map.v1" ||
      sourceMap.slots?.length!==3 || new Set(sourceMap.slots.map(s=>s.id)).size!==3)
    throw Error("INVALID_OFFICIAL_SOURCE_MAP");
  const results=[];
  await mkdir(outputDir,{recursive:true});
  for (const slot of sourceMap.slots) {
    const capture=await captureSource(slot,fetchImpl);
    const {data,...metadata}=capture;
    const safeName=slot.id; // closed allowlist
    if (data) await writeFile(join(outputDir,safeName+".raw"),data);
    results.push({slot_id:slot.id,url:slot.url,record_id:slot.record_id,
      ...metadata,observed_at:new Date().toISOString(),independent_replay:false,
      authority_created:false,production:"HOLD"});
  }
  const receipt={schema_version:"jaywisdom_official_capture.v1",results,
    original_count:results.filter(r=>r.status==="CAPTURED_UNREPLAYED").length,
    independent_replay_count:0,publication:"HOLD",authority_created:false};
  await writeFile(join(outputDir,"capture-receipts.json"),JSON.stringify(receipt,null,2)+"\n");
  return receipt;
}
const invoked=process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked) {
  const dir=dirname(fileURLToPath(import.meta.url));
  const sourceMap=JSON.parse(await readFile(join(dir,"expectations/hr3633-official-source-map.v1.json"),"utf8"));
  if (process.argv[2]!=="--capture") {
    console.log(JSON.stringify({mode:"PLAN_ONLY",slot_urls:sourceMap.slots.map(s=>({id:s.id,url:s.url})),
      network_requests:0,production:"HOLD"},null,2));
  } else {
    const receipt=await captureMap(sourceMap,fetch,
      join(dir,".audit-artifacts/official-inputs"));
    console.log(JSON.stringify({captured:receipt.original_count,expected:3,
      independent_replay:receipt.independent_replay_count,publication:"HOLD"}));
    if(receipt.original_count!==3)process.exitCode=2;
  }
}
