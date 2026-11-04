import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const dir=join(dirname(fileURLToPath(import.meta.url)),".audit-artifacts");
const sha=b=>createHash("sha256").update(b).digest("hex");
const files=await Promise.all(["audit.json","reconstruction-candidate.json","replay-manifest.json"].map(p=>readFile(join(dir,p))));
const [audit,candidate,receipt]=files.map(f=>JSON.parse(f.toString("utf8")));
function demand(cond,msg){if(!cond)throw Error(msg)}
demand(sha(files[0])===receipt.audit_sha256,"AUDIT_HASH_MISMATCH");
demand(sha(files[1])===receipt.candidate_sha256,"CANDIDATE_HASH_MISMATCH");
demand(audit.process_verdict==="PASS"||audit.process_verdict==="FAIL","PROCESS_UNCLASSIFIED");
demand(["PASS","FAIL","UNKNOWN"].includes(audit.evidence_verdict),"EVIDENCE_UNCLASSIFIED");
demand(audit.production==="HOLD"&&candidate.production==="HOLD"&&receipt.production==="HOLD","HOLD_MISSING");
demand(candidate.historical_original_restored===false&&receipt.original_source_recovered===false,"FALSE_HISTORICAL_RECOVERY");
demand(candidate.authority_created===false&&receipt.authority_created===false,"AUTHORITY_VIOLATION");
demand(Array.isArray(audit.observations)&&audit.counts.expected===audit.observations.length,"EXPECTED_SLOTS_UNACCOUNTED");
console.log(JSON.stringify({replay:"PASS",expected:audit.counts.expected,
  missing:audit.counts.missing,evidence:audit.evidence_verdict,production:"HOLD",
  source_originals_reconstructed:false}));
