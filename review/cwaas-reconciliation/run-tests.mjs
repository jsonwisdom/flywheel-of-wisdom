// Offline runner. Node's TS stripping is transpilation, not a TypeScript type check.
import {stripTypeScriptTypes} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const temp=mkdtempSync(resolve(tmpdir(),'cwaas-review-'));
try {
  writeFileSync(resolve(temp,'package.json'),'{"type":"module"}');
  for(const relative of ['src/payment/payment-evidence.ts','src/payment/base-rpc-verifier.ts',
    'review/cwaas-reconciliation/contract.ts','review/cwaas-reconciliation/reconcile.ts']) {
    const target=resolve(temp,relative.replace(/\.ts$/,'.js'));mkdirSync(dirname(target),{recursive:true});
    writeFileSync(target,stripTypeScriptTypes(readFileSync(resolve(root,relative),'utf8')));
  }
  const tests=resolve(temp,'review/cwaas-reconciliation/integration.test.mjs');
  writeFileSync(tests,readFileSync(resolve(root,'review/cwaas-reconciliation/integration.test.mjs')));
  writeFileSync(resolve(temp,'review/cwaas-reconciliation/staging-schema.fixture.sql'),
    readFileSync(resolve(root,'review/cwaas-reconciliation/staging-schema.fixture.sql')));
  const r=spawnSync(process.execPath,['--test',tests],{stdio:'inherit'});process.exitCode=r.status??1;
} finally {rmSync(temp,{recursive:true,force:true});}
