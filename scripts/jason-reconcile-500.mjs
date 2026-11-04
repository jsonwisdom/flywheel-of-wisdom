#!/usr/bin/env node
// JASON Reconciliation Engine v1 — snapshots only; absolutely no writes to external systems.
// Input: directory of independently captured {wolfram,github,cloudflare,chatgpt,stripe}.json
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
const dirs=process.argv[2]||'audit-input',out=process.argv[3]||'audit-output/reconciliation';
const SOURCES=['wolfram','github','cloudflare','chatgpt','stripe'];
const statuses=['PRESENT_VERIFIED','PRESENT_UNVERIFIED','NOT_FOUND','NOT_ACCESSIBLE','NOT_APPLICABLE','CONFLICT'];
const h=s=>createHash('sha256').update(s).digest('hex');
const skus=Array.from({length:500},(_,i)=>'JASON-'+String(i+1).padStart(3,'0'));
const seen={};const snapshots={};const errors=[];
for(const source of SOURCES){
  try{
    const raw=await readFile(join(dirs,source+'.json'),'utf8');
    const data=JSON.parse(raw);
    if(data.source!==source||!Array.isArray(data.rows))throw Error('INVALID_SNAPSHOT_SCHEMA');
    const map=new Map();
    for(const r of data.rows){
      if(!r||!skus.includes(r.sku)||!statuses.includes(r.status)){
        errors.push({source,sku:r?.sku||null,error:'BAD_ROW'});continue;
      }
      if(map.has(r.sku)){errors.push({source,sku:r.sku,error:'DUPLICATE_SKU'});map.set(r.sku,{sku:r.sku,status:'CONFLICT'});}
      else map.set(r.sku,r);
    }
    seen[source]=map;
    snapshots[source]={loaded:true,rows:data.rows.length,sha256:h(raw),observed_at:data.observed_at||null};
  }catch(e){
    seen[source]=new Map();snapshots[source]={loaded:false,error:e.code==='ENOENT'?'NOT_ACCESSIBLE':String(e.message)};
  }
}
const matrix=skus.map(sku=>{
 const sources={};
 for(const s of SOURCES)sources[s]=seen[s].get(sku)||{sku,status:snapshots[s].loaded?'NOT_FOUND':'NOT_ACCESSIBLE'};
 const commerce=sources.stripe;
 const gates={
  specified:['PRESENT_VERIFIED'].includes(sources.chatgpt.status)&&sources.github.status==='PRESENT_VERIFIED',
  math_replayed:sources.wolfram.status==='PRESENT_VERIFIED',
  built:sources.github.status==='PRESENT_VERIFIED',
  runtime_verified:sources.cloudflare.status==='PRESENT_VERIFIED',
  commerce_record:commerce.status==='PRESENT_VERIFIED',
  checkout_ready:commerce.status==='PRESENT_VERIFIED'&&commerce.active===true&&
    typeof commerce.default_price==='string'&&commerce.default_price.length>0&&
    sources.cloudflare.status==='PRESENT_VERIFIED'&&sources.github.status==='PRESENT_VERIFIED'&&
    commerce.delivery_verified===true&&commerce.authorization===true
 };
 return {sku,sources,gates,publication:'HOLD'};
});
const coverage={};
for(const s of SOURCES){
 coverage[s]={};
 for(const st of statuses)coverage[s][st]=matrix.filter(x=>x.sources[s].status===st).length;
}
const summary={schema:'jason.population-audit.v1',run_type:'OFFLINE_READ_ONLY',expected_skus:500,
 sources:snapshots,coverage,exceptions:errors,checkout_ready:matrix.filter(x=>x.gates.checkout_ready).length,
 publication_authorized:false,production_mutation:false,settlement_authorized:false,
 interpretation:'Missing inventory is UNKNOWN, not a missing product. Checkout readiness requires explicit authorization and delivery proof.'};
const output=JSON.stringify({summary,matrix},null,2)+'\n';
await mkdir(out,{recursive:true});
await writeFile(join(out,'matrix.json'),output);
await writeFile(join(out,'matrix.sha256'),h(output)+'  matrix.json\n');
await writeFile(join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({coverage,checkout_ready:summary.checkout_ready,exceptions:errors.length,output:out}));
if(errors.length)process.exitCode=2;
