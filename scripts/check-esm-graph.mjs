/** Read-only CI check: validate Node ESM import graph for the production server. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const pending = [resolve("server.ts")];
const seen = new Set();

while (pending.length) {
  const file = pending.pop();
  if (seen.has(file)) continue;
  seen.add(file);
  if (!existsSync(file)) throw new Error("MISSING_MODULE_SOURCE: " + file);
  const source = readFileSync(file, "utf8");
  const imports = [...source.matchAll(/\bfrom\s*["'](\.{1,2}\/[^"']+)["']/g)];
  for (const [, spec] of imports) {
    if (!spec.endsWith(".js")) throw new Error("ESM_EXTENSION_REQUIRED: " + file + " -> " + spec);
    const target = resolve(dirname(file), spec.slice(0, -3) + ".ts");
    if (!existsSync(target)) throw new Error("ESM_SOURCE_NOT_FOUND: " + file + " -> " + spec);
    pending.push(target);
  }
}
console.log("PASS: MAINNET_ESM_GRAPH modules=" + seen.size);
