import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtemp,writeFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {verifyExternalReport} from "../verify-external-captures.mjs";
const h=b=>createHash("sha256").update(b).digest("hex");
const names=["BILLS-119hr3633rs","BILLS-119hr3633eh","BILLS-119hr3633rh"];
const fixture=(bytes)=>({
  schema_version:"jaywisdom_external_capture_observation.v1",
  captured_source_records:names.map((id,i)=>({
    record_id:id,filename_hint:id+".pdf",bytes_reported:bytes[i].length,
    sha256_reported:h(bytes[i])
  }))
});
async function inDir(fn){
  const dir=await mkdtemp(join(tmpdir(),"jw-external-readback-"));
  try{await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}
}
const docs=names.map((_,i)=>Buffer.from("%PDF-1.4\\n"+"fixture-not-real-pdf-"+i+"-".repeat(20)));
test("local byte digest match is not an independent fetch or proof of PDF identity",()=>inDir(async dir=>{
  for(let i=0;i<3;i++) await writeFile(join(dir,names[i]+".pdf"),docs[i]);
  const out=await verifyExternalReport(fixture(docs),dir);
  assert.equal(out.matched,3);
  assert.equal(out.fail,0);
  assert.equal(out.production,"HOLD");
  assert.equal(out.authority_created,false);
  assert.ok(out.entries.every(x=>x.document_identity_verified_here===false &&
    x.independent_second_fetch_verified_here===false));
}));
test("missing raw PDFs are UNKNOWN and never fabricated as recovered",()=>inDir(async dir=>{
  const out=await verifyExternalReport(fixture(docs),dir);
  assert.equal(out.missing,3);
  assert.equal(out.matched,0);
  assert.equal(out.fail,0);
}));
test("byte-level tampering FAILs despite valid PDF header",()=>inDir(async dir=>{
  for(let i=0;i<3;i++)await writeFile(join(dir,names[i]+".pdf"),docs[i]);
  await writeFile(join(dir,names[1]+".pdf"),Buffer.concat([docs[1],Buffer.from("tamper")]));
  const out=await verifyExternalReport(fixture(docs),dir);
  assert.equal(out.fail,1);
  assert.equal(out.matched,2);
  assert.equal(out.entries[1].reason,"SIZE_MISMATCH");
}));
test("non-PDF payload is FAIL, even when reported digest matches it",()=>inDir(async dir=>{
  const fake=docs.map(Buffer.from);
  fake[0]=Buffer.from("HTML PAGE INSTEAD OF PDF, LONG ENOUGH FOR CHECK");
  for(let i=0;i<3;i++)await writeFile(join(dir,names[i]+".pdf"),fake[i]);
  const out=await verifyExternalReport(fixture(fake),dir);
  assert.equal(out.fail,1);
  assert.equal(out.entries[0].reason,"NOT_PDF_HEADER");
}));
test("record identifier and filename mismatch cannot bind arbitrary files",()=>inDir(async dir=>{
  const report=fixture(docs);
  report.captured_source_records[0].filename_hint="../secret.pdf";
  await assert.rejects(verifyExternalReport(report,dir),/UNSAFE_CAPTURE_FILENAME/);
}));
