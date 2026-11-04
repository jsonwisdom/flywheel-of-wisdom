import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const orbit = process.env.ORBIT || 'inventory';
const allowed = new Set(['inventory','dependencies','knowledge']);
if (!allowed.has(orbit)) throw new Error('Invalid orbit');
const now = new Date().toISOString();
const sources = ['server.ts','package.json','README.md'];
const evidence = [];
for (const path of sources) {
  try {
    const bytes = await readFile(path);
    evidence.push({source:path,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length});
  } catch (e) {
    evidence.push({source:path,status:'NOT_RETRIEVED',error:e.code || 'ERROR'});
  }
}
const publicEndpoints = orbit === 'dependencies'
  ? ['https://jsonwisdom.com/','https://inventory.jsonwisdom.com/','https://game.jsonwisdom.com/','https://audit.jsonwisdom.com/']
  : [];
const checks = [];
for(const url of publicEndpoints){
  const started=Date.now();
  try {
    const response=await fetch(url,{method:'GET',signal:AbortSignal.timeout(8000),redirect:'manual'});
    checks.push({url,status:response.status,elapsed_ms:Date.now()-started,kind:'NONAUTHENTICATED_PUBLIC_PROBE'});
  }catch(e){checks.push({url,status:'UNKNOWN',error:String(e.name),kind:'NONAUTHENTICATED_PUBLIC_PROBE'});}
}
const artifact = {
  schema:'jason.audit.v1',orbit,observed_at:now,
  run_id:process.env.GITHUB_RUN_ID||'local',
  run_attempt:process.env.GITHUB_RUN_ATTEMPT||'local',
  repo_commit:process.env.GITHUB_SHA_SOURCE||'unverified',
  changes_authorized:false,settlement_authorized:false,
  evidence,checks,
  inventory_claims:{target_products:500,verified_live_product_count:null},
  classification:'OBSERVATION_NOT_CERTIFICATION'
};
const canonical=JSON.stringify(artifact);
const sha256=createHash('sha256').update(canonical).digest('hex');
await mkdir('audit-output',{recursive:true});
await writeFile('audit-output/observation.json',canonical+'\n');
await writeFile('audit-output/observation.sha256',sha256+'  observation.json\n');
await writeFile('audit-output/knowledge-candidates.json',JSON.stringify({
 schema:'jason.knowledge-candidates.v1',source_sha256:sha256,
 publish_status:'HOLD',claims:[],note:'No knowledge claims automatically promoted from source availability or hash identity'
})+'\n');
console.log(JSON.stringify({orbit,sha256,evidence_count:evidence.length,public_checks:checks.length,publication:'HOLD'}));
