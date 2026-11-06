import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredDirs = ["products", "schemas", "receipts", "scripts", "releases", "catalog", "identity/jaywisdom.eth"];

async function readJson(rel) {
  return JSON.parse(await readFile(path.join(root, rel), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const rel of requiredDirs) {
  const info = await stat(path.join(root, rel));
  assert(info.isDirectory(), `missing_directory:${rel}`);
}

const catalog = await readJson("catalog/catalog.json");
const identity = await readJson("identity/jaywisdom.eth/operator.json");
const publicCatalog = await readJson("public/catalog.json");

assert(catalog.operator_identity === "jaywisdom.eth", "catalog_identity_mismatch");
assert(identity.identity === "jaywisdom.eth", "identity_manifest_mismatch");
assert(identity.authority_created === false, "authority_must_remain_false");
assert(identity.payment_authority === false, "payment_authority_must_remain_false");
assert(identity.deployment_authority === false, "deployment_authority_must_remain_false");
assert(identity.ens_mutation_performed === false, "ens_mutation_must_remain_false");
assert(catalog.merchant_center_id === "5624520187", "merchant_center_id_mismatch");
assert(catalog.production.checkout_live === false, "checkout_must_remain_false");
assert(catalog.production.payment_processor_live === false, "payment_processor_must_remain_false");
assert(catalog.production.deployment_verified === false, "deployment_must_remain_unverified");
assert(publicCatalog.operator_identity === catalog.operator_identity, "public_identity_drift");
assert(publicCatalog.merchant_center_id === catalog.merchant_center_id, "public_merchant_id_drift");
assert(publicCatalog.production_deployment === false, "public_deployment_must_remain_false");

for (const entry of catalog.products) {
  const manifest = await readJson(entry.manifest);
  assert(manifest.product_id === entry.product_id, `product_id_mismatch:${entry.product_id}`);
  assert(manifest.operator_identity === "jaywisdom.eth", `product_identity_mismatch:${entry.product_id}`);
  assert(manifest.payment_processor_live === false, `payment_processor_live:${entry.product_id}`);
  assert(manifest.production_deployment === false, `production_deployment_live:${entry.product_id}`);
  assert(manifest.authority_created === false, `authority_created:${entry.product_id}`);

  const projected = publicCatalog.products.find(p => p.product_id === manifest.product_id);
  assert(projected, `missing_public_product:${entry.product_id}`);
  assert(projected.name === manifest.name, `public_name_drift:${entry.product_id}`);
  assert(projected.commercial_state === manifest.commercial_state, `public_state_drift:${entry.product_id}`);
  assert(projected.price.amount_usd === manifest.price.amount_usd, `public_price_drift:${entry.product_id}`);
  assert(projected.price.mode === manifest.price.mode, `public_price_mode_drift:${entry.product_id}`);
}

console.log(JSON.stringify({
  result: "PASS",
  directories_first: true,
  operator_identity: "jaywisdom.eth",
  merchant_center_id: "5624520187",
  products_verified: catalog.products.length,
  production_deployment: false,
  payment_processor_live: false,
  authority_created: false
}, null, 2));
