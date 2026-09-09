import { field, runNullEngine, type EngineOutput } from "./null-engine";
import type { KnowledgeObject, ObjectType, PaymentClass } from "./knowledge-object";
import { sha256Hex } from "./knowledge-manifest";

export interface IngestInput {
  id: string;
  type: ObjectType;
  version: string;
  bytes?: Uint8Array | Buffer | string;
  media_type?: string;
  parent_id?: string;
  source_uri?: string;
  provenance?: string;
  payment_class?: PaymentClass;
}

export function ingest(input: IngestInput): { object: KnowledgeObject; engine: EngineOutput } {
  const hasBytes = input.bytes !== undefined;
  const buf = hasBytes
    ? typeof input.bytes === "string"
      ? Buffer.from(input.bytes, "utf8")
      : Buffer.from(input.bytes)
    : null;

  const object: KnowledgeObject = {
    id: input.id,
    type: input.type,
    version: input.version,
    content_hash: hasBytes && buf
      ? field("PRESENT", sha256Hex(buf), "sha256_of_bytes")
      : field("NOT_LOADED", null, "bytes_not_supplied"),
    media_type: input.media_type
      ? field("PRESENT", input.media_type, "caller")
      : field("UNKNOWN", null, "media_type_not_supplied"),
    size: buf ? field("PRESENT", buf.byteLength, "byteLength") : field("NOT_LOADED", null, "no_bytes"),
    parent_id: input.parent_id
      ? field("PRESENT", input.parent_id, "caller")
      : field("NOT_APPLICABLE", null, "no_parent"),
    source_uri: input.source_uri
      ? field("PRESENT", input.source_uri, "caller")
      : field("NOT_LOADED", null, "source_uri_not_fetched"),
    provenance: input.provenance
      ? field("UNVERIFIED", null, input.provenance)
      : field("UNKNOWN", null, "no_provenance_receipt"),
    payment_class: field("PRESENT", input.payment_class ?? "x402", "default_or_caller"),
    state: field("PRESENT", "INGESTED", "ingest_v0"),
  };

  const engine = runNullEngine({
    fields: {
      content_hash: object.content_hash,
      media_type: object.media_type,
      size: object.size,
      parent_id: object.parent_id,
      source_uri: object.source_uri,
      provenance: object.provenance,
      payment_class: object.payment_class,
      state: object.state,
    },
    required: ["content_hash", "payment_class", "state"],
  });

  return {
    object: {
      ...object,
      content_hash: engine.fields.content_hash as KnowledgeObject["content_hash"],
      media_type: engine.fields.media_type as KnowledgeObject["media_type"],
      size: engine.fields.size as KnowledgeObject["size"],
      parent_id: engine.fields.parent_id as KnowledgeObject["parent_id"],
      source_uri: engine.fields.source_uri as KnowledgeObject["source_uri"],
      provenance: engine.fields.provenance as KnowledgeObject["provenance"],
      payment_class: engine.fields.payment_class as KnowledgeObject["payment_class"],
      state: engine.fields.state as KnowledgeObject["state"],
    },
    engine,
  };
}
