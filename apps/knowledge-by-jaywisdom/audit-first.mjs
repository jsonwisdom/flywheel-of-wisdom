/**
 * CI Audit First: EXPECT → AUDIT → RECONSTRUCT → REPLAY.
 * Rebuilds safe *candidate design artifacts*, never historical source bytes.
 * No network, wallet, Stripe, secret access, or live funds.
 */
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, relative, join, dirname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
function safePath(root, raw) {
  if (typeof raw !== "string" || !raw || isAbsolute(raw) || raw.includes("\\"))
    throw Error("UNSAFE_EXPECTED_PATH");
  const full = resolve(root, raw), rel = relative(resolve(root), full);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw Error("UNSAFE_EXPECTED_PATH");
  return full;
}
export function validateContract(contract) {
  if (!contract || contract.schema_version !== "jaywisdom_expectations.v1" ||
      !Array.isArray(contract.expected_slots) || !contract.expected_slots.length)
    throw Error("INVALID_EXPECTATION_CONTRACT");
  const ids = new Set(), paths = new Set();
  for (const slot of contract.expected_slots) {
    if (!/^[a-z][a-z0-9_]*$/.test(slot.id) ||
        !["PRIMARY_SOURCE", "DERIVED_ANALYSIS", "DERIVED_RECEIPT", "VERIFIER_RECEIPT"].includes(slot.role) ||
        typeof slot.required !== "boolean" ||
        (slot.expected_sha256 !== null && !/^[a-f0-9]{64}$/i.test(slot.expected_sha256)) ||
        !["METADATA_TEMPLATE_ONLY", "REBUILDABLE_TEMPLATE"].includes(slot.reconstruction) ||
        typeof slot.origin !== "string" || !slot.origin)
      throw Error("INVALID_EXPECTED_SLOT");
    safePath("/safe-root", slot.path);
    if (ids.has(slot.id) || paths.has(slot.path)) throw Error("DUPLICATE_EXPECTED_SLOT");
    ids.add(slot.id);paths.add(slot.path);
  }
  if (contract.authority_created !== false ||
      contract.reconstruction_contract?.historical_digest_recovered !== false ||
      contract.reconstruction_contract?.authority_created !== false)
    throw Error("AUTHORITY_ORIGINAL_BYTES_BOUNDARY");
  return true;
}
export async function auditExpectations(contract, root) {
  validateContract(contract);
  const observations = [];
  for (const slot of contract.expected_slots) {
    const path = safePath(root, slot.path);
    let bytes;
    try { bytes = await readFile(path); }
    catch (err) {
      observations.push({
        id: slot.id, role: slot.role, path: slot.path, required: slot.required,
        verdict: err.code === "ENOENT" ? "UNKNOWN" : "FAIL",
        reason: err.code === "ENOENT" ? "EXPECTED_FILE_NOT_LOADED" : "FILE_READ_ERROR",
        bytes_recovered: false, actual_sha256: null, expected_sha256: slot.expected_sha256
      });
      continue;
    }
    const actual_sha256 = sha256(bytes);
    let verdict, reason;
    try { JSON.parse(bytes.toString("utf8")); }
    catch { verdict = "FAIL"; reason = "INVALID_SOURCE_JSON"; }
    if (!verdict && slot.expected_sha256 && actual_sha256 !== slot.expected_sha256) {
      verdict = "FAIL";reason = "SHA256_MISMATCH";
    } else if (!verdict && !slot.expected_sha256) {
      verdict = "UNKNOWN";reason = "FILE_PRESENT_HASHED_BUT_NOT_TRUST_BOUND";
    } else if (!verdict) {
      verdict = "PASS";reason = "EXACT_HASH_MATCH";
    }
    observations.push({
      id: slot.id, role: slot.role, path: slot.path, required: slot.required,
      verdict, reason, bytes_recovered: true, actual_sha256,
      expected_sha256: slot.expected_sha256
    });
  }
  const failures = observations.filter(x => x.verdict === "FAIL");
  const unknownRequired = observations.filter(x => x.required && x.verdict !== "PASS");
  return {
    schema_version: "jaywisdom_audit.v1", project: contract.project,
    method: contract.method, authority_created: false,
    process_verdict: failures.length ? "FAIL" : "PASS",
    evidence_verdict: failures.length ? "FAIL" : unknownRequired.length ? "UNKNOWN" : "PASS",
    production: "HOLD",
    observations,
    counts: {
      expected: observations.length,
      present_hashed: observations.filter(x => x.bytes_recovered).length,
      missing: observations.filter(x => x.reason === "EXPECTED_FILE_NOT_LOADED").length,
      fail: failures.length,
      required_unverified: unknownRequired.length
    },
    non_claim: "PROCESS_PASS_NEVER_PROVES_SOURCE_CLAIM_TRUE"
  };
}
export function reconstructCandidate(contract, audit) {
  validateContract(contract);
  if (audit.schema_version !== "jaywisdom_audit.v1") throw Error("INVALID_AUDIT");
  const provenance = contract.expected_slots.map(slot => {
    const observed = audit.observations.find(o => o.id === slot.id);
    if (!observed) throw Error("UNACCOUNTED_EXPECTED_SLOT");
    return {
      id: slot.id, expected_path: slot.path, source_origin: slot.origin,
      role: slot.role, original_bytes_observed: observed.bytes_recovered,
      observed_sha256: observed.actual_sha256, comparison_verdict: observed.verdict,
      reconstruction_policy: slot.reconstruction,
      candidate_state: slot.role === "PRIMARY_SOURCE" ? "SOURCE_LOOKUP_REQUIRED" : "REBUILDABLE_DESIGN",
      commercial_reuse: slot.commercial_reuse ?? "RIGHTS_REVIEW_UNRESOLVED"
    };
  });
  const template = {
    schema_version: "jaywisdom_reconstructed_design.v1",
    project: contract.project,
    status: "DRAFT_UNVERIFIED",
    reconstruction_method: "EXPECTED_CONTRACT_PLUS_OBSERVED_FILE_STATES",
    historical_original_restored: false,
    independent_historical_digest_match: false,
    authority_created: false,
    sources: provenance,
    claim_ledger_template: {
      claims: [],
      required_fields_per_claim: ["claim_id","claim_text","primary_source_id",
        "source_content_sha256","method","comparison_verdict","truth_status","replay_ref"],
      default_comparison_verdict: "UNKNOWN", default_truth_status: "UNDETERMINED"
    },
    manifest_template: { entries: [], canonicalization: "raw-byte-sha256", root: null,
      note: "Populate with independently captured source bytes; never fabricate a historical hash" },
    release_gates: contract.release_gates.map(gate => ({ gate, status: "UNKNOWN", evidence: [] })),
    production: "HOLD",
    payment_granted: false
  };
  return template;
}
export async function runAudit({ contractPath, repoRoot, outputDir }) {
  const contract = JSON.parse(await readFile(contractPath, "utf8"));
  const audit = await auditExpectations(contract, repoRoot);
  const candidate = reconstructCandidate(contract, audit);
  await mkdir(outputDir, { recursive: true });
  const a = Buffer.from(JSON.stringify(audit, null, 2) + "\n");
  const c = Buffer.from(JSON.stringify(candidate, null, 2) + "\n");
  await writeFile(join(outputDir, "audit.json"), a);
  await writeFile(join(outputDir, "reconstruction-candidate.json"), c);
  const manifest = {
    schema_version: "jaywisdom_reconstruction_receipt.v1",
    source_contract_sha256: sha256(await readFile(contractPath)),
    audit_sha256: sha256(a), candidate_sha256: sha256(c),
    historical_digest_recovered: false,
    original_source_recovered: false, authority_created: false, production: "HOLD"
  };
  await writeFile(join(outputDir, "replay-manifest.json"), JSON.stringify(manifest, null, 2)+"\n");
  return { audit, candidate, manifest };
}
const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const home = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(home, "../..");
  const contractPath = resolve(home, "expectations/crypto-congress.v1.json");
  const outputDir = resolve(process.argv[2] ?? join(home, ".audit-artifacts"));
  const { audit } = await runAudit({ contractPath, repoRoot, outputDir });
  console.log(JSON.stringify({
    process: audit.process_verdict, evidence: audit.evidence_verdict,
    counts: audit.counts, reconstruction: "CANDIDATE_ONLY", production: "HOLD"
  }, null, 2));
  if (audit.process_verdict === "FAIL") process.exitCode = 1;
}
