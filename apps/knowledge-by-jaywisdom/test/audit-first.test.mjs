import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { auditExpectations, reconstructCandidate, runAudit, validateContract } from "../audit-first.mjs";
const contract = {
  schema_version: "jaywisdom_expectations.v1", project: "fixture", method: "EXPECT_AUDIT_RECONSTRUCT_REPLAY",
  authority_created: false, release_gates: ["source_replay"],
  expected_slots: [
    { id:"source",path:"evidence/crypto-congress/source.json",role:"PRIMARY_SOURCE",
      origin:"https://example.org",required:true,expected_sha256:null,reconstruction:"METADATA_TEMPLATE_ONLY" },
    { id:"derived",path:"evidence/crypto-congress/derived.json",role:"DERIVED_ANALYSIS",
      origin:"local",required:true,expected_sha256:null,reconstruction:"REBUILDABLE_TEMPLATE" }
  ],
  reconstruction_contract: { authority_created:false, historical_digest_recovered:false }
};
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), "jaywisdom-audit-"));
  try { return await fn(root); } finally { await rm(root, {recursive:true,force:true}); }
}
test("EXPECT: contract refuses path traversal, duplicated entries and fabricated authority", () => {
  assert.equal(validateContract(contract), true);
  assert.throws(() => validateContract({ ...contract,
    expected_slots:[{...contract.expected_slots[0],path:"../../secret"}] }), /UNSAFE_EXPECTED_PATH/);
  assert.throws(() => validateContract({ ...contract, authority_created: true }), /AUTHORITY/);
});
test("AUDIT: absent expected source is UNKNOWN; process can PASS", () => fixture(async root => {
  const a = await auditExpectations(contract, root);
  assert.equal(a.process_verdict, "PASS");
  assert.equal(a.evidence_verdict, "UNKNOWN");
  assert.equal(a.counts.missing, 2);
  assert.equal(a.production, "HOLD");
}));
test("AUDIT: a file present with no trusted original digest is still UNKNOWN", () => fixture(async root => {
  const path = join(root,contract.expected_slots[0].path);
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,'{"source":"test"}');
  const a = await auditExpectations(contract,root);
  assert.equal(a.counts.present_hashed,1);
  assert.equal(a.observations[0].reason,"FILE_PRESENT_HASHED_BUT_NOT_TRUST_BOUND");
  assert.equal(a.evidence_verdict,"UNKNOWN");
}));
test("AUDIT: known digest tampering is FAIL", () => fixture(async root => {
  const path=join(root,contract.expected_slots[0].path);
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path,'{"source":"changed"}');
  const locked={...contract,expected_slots:[{...contract.expected_slots[0],expected_sha256:"0".repeat(64)},contract.expected_slots[1]]};
  const a=await auditExpectations(locked,root);
  assert.equal(a.process_verdict,"FAIL");
  assert.equal(a.observations[0].reason,"SHA256_MISMATCH");
}));
test("RECONSTRUCT: rebuilds schema/design with no invented primary records", () => fixture(async root => {
  const a = await auditExpectations(contract,root);
  const c = reconstructCandidate(contract,a);
  assert.equal(c.historical_original_restored,false);
  assert.equal(c.payment_granted,false);
  assert.equal(c.sources[0].candidate_state,"SOURCE_LOOKUP_REQUIRED");
  assert.equal(c.claim_ledger_template.claims.length,0);
  assert.equal(c.manifest_template.root,null);
  assert.ok(c.release_gates.every(x => x.status==="UNKNOWN"));
}));
test("REPLAY: emitted candidate digests verify exact saved bytes", () => fixture(async root => {
  const path=join(root,"expectation.json");
  await writeFile(path,JSON.stringify(contract));
  const outputDir=join(root,"derived-output");
  const {manifest}=await runAudit({contractPath:path,repoRoot:root,outputDir});
  const content=await readFile(join(outputDir,"reconstruction-candidate.json"));
  const { createHash }=await import("node:crypto");
  assert.equal(manifest.candidate_sha256,createHash("sha256").update(content).digest("hex"));
  assert.equal(manifest.historical_digest_recovered,false);
  assert.equal(manifest.candidate_file_receipts.length,2);
  for (const record of manifest.candidate_file_receipts) {
    const candidateFile=await readFile(join(outputDir,record.path));
    assert.equal(record.candidate_sha256,createHash("sha256").update(candidateFile).digest("hex"));
    const candidate=JSON.parse(candidateFile.toString());
    assert.equal(candidate.reconstructed_not_recovered,true);
    assert.equal(candidate.original_bytes,null);
    assert.equal(candidate.source_recovered,false);
    assert.equal(candidate.authority_created,false);
  }
}));

test("RECONSTRUCT: synthetic source blueprints never fabricate votes or historical bytes", () => fixture(async root => {
  const path=join(root,"expectation.json");
  await writeFile(path,JSON.stringify(contract));
  const outputDir=join(root,"derived-output");
  await runAudit({contractPath:path,repoRoot:root,outputDir});
  const primary=JSON.parse(await readFile(join(outputDir,"candidates/source.candidate.json"),"utf8"));
  assert.equal(primary.status,"SOURCE_LOOKUP_REQUIRED");
  assert.equal(primary.blueprint.source_payload,null);
  assert.equal(primary.historical_digest,null);
  const derived=JSON.parse(await readFile(join(outputDir,"candidates/derived.candidate.json"),"utf8"));
  assert.equal(derived.status,"DRAFT_UNVERIFIED");
  assert.equal(derived.production,"HOLD");
}));
