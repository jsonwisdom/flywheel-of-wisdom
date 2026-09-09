import type { ManifestEntry } from "./knowledge-object";
import { hashLeaf as taggedLeaf, prove, verify, type Hex, type MerkleProof, type VerifyResult } from "./merkle-proof";

export function entryPreimage(e: ManifestEntry): string {
  return `${e.path}\t${e.type}\t${e.object_id}\t${e.version_id}\t${e.content_hash}`;
}

export function entryLeaves(entries: ManifestEntry[]): { sorted: ManifestEntry[]; leaves: Hex[] } {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { sorted, leaves: sorted.map((e) => taggedLeaf(entryPreimage(e))) };
}

export function proveEntry(entries: ManifestEntry[], path: string): MerkleProof {
  const { sorted, leaves } = entryLeaves(entries);
  const index = sorted.findIndex((e) => e.path === path);
  if (index < 0) throw new Error("PATH_NOT_IN_MANIFEST");
  return prove(leaves, index);
}

export function verifyEntry(proof: MerkleProof, expectedBinaryRoot: Hex): VerifyResult {
  return verify(proof, expectedBinaryRoot);
}
