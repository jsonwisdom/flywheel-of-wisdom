import { ingest } from "../knowledge/ingest";
import { makeEntry, makeManifest } from "../knowledge/knowledge-manifest";
import { buildTree, prove, type MerkleProof } from "../knowledge/merkle-proof";
import { entryLeaves } from "../knowledge/manifest-merkle-bridge";

export interface PaidKnowledgeResult {
  object_id: string;
  version_id: string;
  engine_status: string;
  object: unknown;
  manifest_root: string | null;
  binary_merkle_root: string | null;
  proof: MerkleProof | null;
  settlement_tx: string | null;
  payment_price_usd: number;
  note: string;
}

export function deliverPaidKnowledge(args: {
  object_id: string;
  body: string;
  type?: "answer" | "document" | "receipt";
  settlement_tx: string | null;
}): PaidKnowledgeResult {
  const version_id = "v0.1.0";
  const { object, engine } = ingest({
    id: args.object_id,
    type: args.type ?? "answer",
    version: version_id,
    bytes: args.body,
    media_type: "text/plain",
    payment_class: "x402",
    provenance: "x402-settlement-pending-verification",
  });
  const entry = makeEntry(`${args.object_id}.txt`, args.object_id, version_id, args.body, "answer");
  const manifest = makeManifest({ object_id: args.object_id, version_id, entries: [entry] });
  const { leaves } = entryLeaves(manifest.entries);
  const { root: binaryRoot } = buildTree(leaves);
  const proof = prove(leaves, 0);
  return {
    object_id: args.object_id,
    version_id,
    engine_status: engine.status,
    object,
    manifest_root: manifest.content_hash.value,
    binary_merkle_root: binaryRoot,
    proof,
    settlement_tx: args.settlement_tx,
    payment_price_usd: 1,
    note: "Null-engine classified fields. Merkle membership vs declared root. Settlement tx ≠ identity. AUTHORITY_CREATED=false.",
  };
}
