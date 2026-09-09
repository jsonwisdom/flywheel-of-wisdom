import { createHash } from "node:crypto";

export type Hex = `0x${string}`;
export type Side = "L" | "R";

export interface ProofStep {
  sibling: Hex;
  side: Side;
}

export interface MerkleProof {
  leaf: Hex;
  index: number;
  steps: ProofStep[];
  root: Hex;
  leaf_count: number;
  domain: "merkle-proof.v0";
}

export interface VerifyResult {
  ok: boolean;
  reason: string;
  computed_root?: Hex;
}

const DOMAIN_LEAF = "v0:leaf:";
const DOMAIN_NODE = "v0:node:";

export function sha256Hex(data: Uint8Array | Buffer | string): Hex {
  const h = createHash("sha256");
  h.update(typeof data === "string" ? Buffer.from(data, "utf8") : data);
  return (`0x${h.digest("hex")}`) as Hex;
}

export function hashLeaf(preimage: Uint8Array | Buffer | string): Hex {
  return sha256Hex(DOMAIN_LEAF + (typeof preimage === "string" ? preimage : Buffer.from(preimage).toString("hex")));
}

export function hashNode(left: Hex, right: Hex): Hex {
  return sha256Hex(`${DOMAIN_NODE}${left}${right}`);
}

function padToPowerOfTwo(leaves: Hex[]): Hex[] {
  if (leaves.length === 0) return [];
  const out = leaves.slice();
  let n = 1;
  while (n < out.length) n *= 2;
  while (out.length < n) out.push(hashLeaf(`pad:${out.length}`));
  return out;
}

export function buildTree(leafHashes: Hex[]): { layers: Hex[][]; root: Hex } {
  if (leafHashes.length === 0) throw new Error("EMPTY_LEAVES");
  const level0 = padToPowerOfTwo(leafHashes);
  const layers: Hex[][] = [level0];
  let cur = level0;
  while (cur.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < cur.length; i += 2) next.push(hashNode(cur[i], cur[i + 1]));
    layers.push(next);
    cur = next;
  }
  return { layers, root: cur[0] };
}

export function prove(leafHashes: Hex[], index: number): MerkleProof {
  if (index < 0 || index >= leafHashes.length) throw new Error("INDEX_OUT_OF_RANGE");
  const { layers, root } = buildTree(leafHashes);
  const steps: ProofStep[] = [];
  let i = index;
  for (let level = 0; level < layers.length - 1; level++) {
    const layer = layers[level];
    const isLeft = i % 2 === 0;
    steps.push({ sibling: layer[isLeft ? i + 1 : i - 1], side: isLeft ? "L" : "R" });
    i = Math.floor(i / 2);
  }
  return { leaf: leafHashes[index], index, steps, root, leaf_count: leafHashes.length, domain: "merkle-proof.v0" };
}

export function verify(proof: MerkleProof, expectedRoot: Hex): VerifyResult {
  if (proof.domain !== "merkle-proof.v0") return { ok: false, reason: "DOMAIN_MISMATCH" };
  if (proof.root.toLowerCase() !== expectedRoot.toLowerCase()) return { ok: false, reason: "DECLARED_ROOT_MISMATCH" };
  if (!/^0x[0-9a-fA-F]{64}$/.test(proof.leaf) || !/^0x[0-9a-fA-F]{64}$/.test(expectedRoot)) {
    return { ok: false, reason: "HASH_MALFORMED" };
  }
  let h = proof.leaf.toLowerCase() as Hex;
  for (const step of proof.steps) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(step.sibling)) return { ok: false, reason: "SIBLING_MALFORMED" };
    const sib = step.sibling.toLowerCase() as Hex;
    if (step.side === "L") h = hashNode(h, sib);
    else if (step.side === "R") h = hashNode(sib, h);
    else return { ok: false, reason: "SIDE_MALFORMED" };
  }
  if (h.toLowerCase() !== expectedRoot.toLowerCase()) return { ok: false, reason: "ROOT_NOT_EQUAL", computed_root: h };
  return { ok: true, reason: "MEMBERSHIP", computed_root: h };
}

export function noProof(): VerifyResult {
  return { ok: false, reason: "NO_PROOF_NOT_NON_MEMBERSHIP" };
}
