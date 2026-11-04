/** Local readback of operator-reported public-document receipts. No network. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve, isAbsolute, basename } from "node:path";
import { fileURLToPath } from "node:url";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function safeBasename(name) {
  if (typeof name!=="string" || !/^BILLS-119hr3633(?:rs|eh|rh)\.pdf$/.test(name) ||
      basename(name)!==name || isAbsolute(name)) throw Error("UNSAFE_CAPTURE_FILENAME");
  return name;
}
export async function verifyExternalReport(report, directory) {
  if (report?.schema_version!=="jaywisdom_external_capture_observation.v1" ||
      !Array.isArray(report.captured_source_records) ||
      report.captured_source_records.length!==3 ||
      new Set(report.captured_source_records.map(r=>r.record_id)).size!==3)
    throw Error("INVALID_EXTERNAL_CAPTURE_REPORT");
  const entries=[];
  for (const record of report.captured_source_records) {
    const filename=safeBasename(record.filename_hint);
    const expectedId=filename.slice(0,-4);
    if (record.record_id!==expectedId || !/^[a-f0-9]{64}$/.test(record.sha256_reported) ||
        !Number.isSafeInteger(record.bytes_reported) || record.bytes_reported<20)
      throw Error("INVALID_REPORTED_RECEIPT");
    let bytes;
    try { bytes=await readFile(join(directory,filename)); }
    catch (e) {
      entries.push({record_id:record.record_id,verdict:"UNKNOWN",reason:
        e?.code==="ENOENT"?"UNMOUNTED_REPORTED_CAPTURE":"LOCAL_CAPTURE_READ_ERROR"});
      continue;
    }
    const actualDigest=sha(bytes);
    const headerIsPdf=bytes.subarray(0,5).toString("ascii")==="%PDF-";
    const sizeMatches=bytes.length===record.bytes_reported;
    const digestMatches=actualDigest===record.sha256_reported;
    entries.push({record_id:record.record_id,
      verdict:headerIsPdf&&sizeMatches&&digestMatches?"PASS":"FAIL",
      reason:!headerIsPdf?"NOT_PDF_HEADER":!sizeMatches?"SIZE_MISMATCH":
        !digestMatches?"SHA256_MISMATCH":"LOCAL_RAW_BYTES_MATCH_REPORTED_RECEIPT",
      bytes_read:bytes.length,actual_sha256:actualDigest,
      independent_second_fetch_verified_here:false,
      document_identity_verified_here:false
    });
  }
  return {
    schema_version:"jaywisdom_external_receipt_readback.v1",
    entries,matched:entries.filter(e=>e.verdict==="PASS").length,
    missing:entries.filter(e=>e.verdict==="UNKNOWN").length,
    fail:entries.filter(e=>e.verdict==="FAIL").length,
    operator_reported_second_fetches_not_reverified_here:true,
    production:"HOLD",authority_created:false
  };
}
const invoked=process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url);
if (invoked) {
  const root=new URL("./observations/hr3633-2026-11-04-external-capture.v1.json",import.meta.url);
  const report=JSON.parse(await readFile(root,"utf8"));
  const index=process.argv.indexOf("--dir");
  const dir=index>=0?process.argv[index+1]:null;
  if (!dir) {
    console.log(JSON.stringify({mode:"PLAN_ONLY",required_file_hints:report.captured_source_records.map(x=>x.filename_hint),
      usage:"node verify-external-captures.mjs --dir /path/to/PDFs",
      network_requests:0,production:"HOLD"},null,2));
  } else {
    const verdict=await verifyExternalReport(report,resolve(dir));
    console.log(JSON.stringify(verdict,null,2));
    if (verdict.fail)process.exitCode=1;
  }
}
