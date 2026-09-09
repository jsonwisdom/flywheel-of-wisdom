import { createHash } from "node:crypto";
import type { Hex, ManifestEntry, ObjectType, KnowledgeManifest } from "./knowledge-object";
import { field } from "./null-engine";

export function sha256Hex(bytes: Uint8Array | Buffer | string): Hex {
  const h = createHash("sha256");
  h.update(typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes);
  return (`0x${h.digest("hex")}`) as Hex;
}

export function hashLeaf(path: string, content: Uint8Array | Buffer | string): Hex {
  return sha256Hex(`leaf:${path}:${sha256Hex(content)}`);
}

export function hashManifestEntries(entries: ManifestEntry[]): Hex {
  const lines = [...entries]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((e) => `${e.path}\t${e.type}\t${e.object_id}\t${e.version_id}\t${e.content_hash}`);
  return sha256Hex(`manifest-v0\n${lines.join("\n")}`);
}

export function makeEntry(
  path: string,
  object_id: string,
  version_id: string,
  content: Uint8Array | Buffer | string,
  type: ObjectType
): ManifestEntry {
  return { path, object_id, version_id, content_hash: hashLeaf(path, content), type };
}

export function makeManifest(args: {
  object_id: string;
  version_id: string;
  entries: ManifestEntry[];
  parent_version_id?: string | null;
  supersedes?: string | null;
}): KnowledgeManifest {
  const content_hash = hashManifestEntries(args.entries);
  return {
    id: `manifest:${args.object_id}:${args.version_id}`,
    type: "manifest",
    version: "0.1",
    object_id: args.object_id,
    version_id: args.version_id,
    content_hash: field("PRESENT", content_hash, "root_of_sorted_entries"),
    entries: [...args.entries].sort((a, b) => (a.path < b.path ? -1 : 1)),
    parent_version_id: args.parent_version_id
      ? field("PRESENT", args.parent_version_id, "parent")
      : field("NOT_APPLICABLE", null, "root_release"),
    supersedes: args.supersedes
      ? field("PRESENT", args.supersedes, "supersedes")
      : field("NOT_APPLICABLE", null, "no_predecessor"),
  };
}

export function bumpLeaf(
  prev: KnowledgeManifest,
  path: string,
  newContent: Uint8Array | Buffer | string,
  new_version_id: string
): KnowledgeManifest {
  const nextEntries = prev.entries.map((e) =>
    e.path === path
      ? { ...e, version_id: new_version_id, content_hash: hashLeaf(path, newContent) }
      : e
  );
  return makeManifest({
    object_id: prev.object_id,
    version_id: new_version_id,
    entries: nextEntries,
    parent_version_id: prev.version_id,
    supersedes: prev.version_id,
  });
}
