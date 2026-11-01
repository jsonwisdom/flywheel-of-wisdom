/** Faithful single-entry port of src/knowledge/{knowledge-manifest,manifest-merkle-bridge,merkle-proof}.ts. */
import { createHash } from "node:crypto";
const sha=s=>"0x"+createHash("sha256").update(s).digest("hex");
const HASH=/^0x[0-9a-fA-F]{64}$/;
export function knowledgeProof(objectId,versionId,contentSha,type="answer"){
 if(!HASH.test(contentSha)||!/^[a-z0-9:_-]{1,128}$/i.test(objectId)||typeof versionId!=="string")
  throw Error("BAD_PROOF_INPUT");
 const path=objectId+".txt";
 const entryHash=sha("leaf:"+path+":"+contentSha);
 const preimage=[path,type,objectId,versionId,entryHash].join("\t");
 const manifestRoot=sha("manifest-v0\n"+preimage);
 const leaf=sha("v0:leaf:"+preimage);
 const proof={leaf,index:0,steps:[],root:leaf,leaf_count:1,domain:"merkle-proof.v0"};
 return {manifest_root:manifestRoot,binary_merkle_root:leaf,proof};
}
export function verifyKnowledgeProof(receipt){
 try{
  const p=knowledgeProof(receipt.object_id,receipt.version_id,receipt.content_sha256);
  const a=JSON.stringify(p.proof),b=JSON.stringify(receipt.proof);
  return receipt.manifest_root===p.manifest_root&&
   receipt.binary_merkle_root===p.binary_merkle_root&&a===b;
 }catch{return false}
}

/** Offline: prove the exact bytes the client received belong to this receipt. */
export function verifyPaidResponse(rawUtf8,receipt){
 if(typeof rawUtf8!=="string"||!receipt||!verifyKnowledgeProof(receipt))return false;
 let p;try{p=JSON.parse(rawUtf8)}catch{return false}
 return p.object_id===receipt.object_id&&p.version_id===receipt.version_id&&
  p.content_sha256===receipt.content_sha256&&typeof p.body==="string"&&
  sha(p.body)===receipt.content_sha256&&sha(rawUtf8)===receipt.response_sha256;
}
