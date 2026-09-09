/**
 * knowledge-object v0.1
 * Chat declaration ≠ protocol constitution.
 * ≠ JASON_STATE ≠ ENS ≠ wallet ≠ Cluster A
 */

export type Hex = `0x${string}`;

export type ObjectType =
  | "image"
  | "manual"
  | "document"
  | "source_file"
  | "directory"
  | "repository_tree"
  | "dataset"
  | "receipt"
  | "attestation"
  | "manifest"
  | "answer"
  | "bundle";

export type PaymentClass = "unpriced" | "x402" | "included" | "not_for_sale";

export type FieldState =
  | "PRESENT"
  | "MISSING"
  | "UNKNOWN"
  | "NOT_APPLICABLE"
  | "NOT_REQUESTED"
  | "NOT_LOADED"
  | "UNVERIFIED"
  | "CONFLICT"
  | "REDACTED"
  | "DELETED"
  | "UNAVAILABLE";

export interface FieldEvidence {
  kind: string;
  ref?: string;
  note?: string;
}

export interface TypedField<T = unknown> {
  state: FieldState;
  value: T | null;
  evidence: FieldEvidence[];
  reason?: string;
}

export interface KnowledgeObject {
  id: string;
  type: ObjectType;
  version: string;
  content_hash: TypedField<Hex>;
  media_type: TypedField<string>;
  size: TypedField<number>;
  parent_id: TypedField<string>;
  source_uri: TypedField<string>;
  provenance: TypedField<string>;
  payment_class: TypedField<PaymentClass>;
  state: TypedField<string>;
}

export interface ManifestEntry {
  path: string;
  object_id: string;
  version_id: string;
  content_hash: Hex;
  type: ObjectType;
}

export interface KnowledgeManifest {
  id: string;
  type: "manifest";
  version: string;
  object_id: string;
  version_id: string;
  content_hash: TypedField<Hex>;
  entries: ManifestEntry[];
  parent_version_id: TypedField<string>;
  supersedes: TypedField<string>;
}

export const SPEC = {
  knowledge_object: "v0.1",
  knowledge_manifest: "v0.1",
  null_engine: "v0.1",
  authority_created: false,
} as const;
