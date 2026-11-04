/**
 * Knowledge by JayWisdom. Public discovery only; private content is NEVER in Git.
 * HOLD is deliberate: no audit report is certified by a price tag.
 */
export const CATALOG = Object.freeze([
  Object.freeze({
    id: "evidence-replay-method-v1",
    title: "Knowledge by JayWisdom — Evidence Replay Method",
    version: "1.0.0",
    price: { currency: "usd", cents: 100 },
    release_state: "HOLD",
    reason: "Operator-approved, hash-bound delivery bytes not yet published",
    content_sha256: null,
    public_sources: [
      "https://github.com/jsonwisdom/flywheel-of-wisdom/blob/main/docs/replay003-settlement-object-binding.md",
      "https://github.com/jsonwisdom/receiptos-base/blob/main/ACTIVE_LANES.md"
    ]
  }),
  Object.freeze({
    id: "crypto-congress-audit-v1",
    title: "Knowledge by JayWisdom — Crypto Congress Evidence Bundle",
    version: "1.0.0",
    price: { currency: "usd", cents: 100 },
    release_state: "HOLD",
    reason: "Original source references, digests, findings and independent review incomplete",
    content_sha256: null,
    public_sources: [
      "https://github.com/jsonwisdom/flywheel-of-wisdom",
      "https://github.com/jsonwisdom/receiptos-base"
    ]
  })
]);
export function getProduct(id) {
  return CATALOG.find(p => p.id === id) ?? null;
}
export function catalogPreview() {
  return CATALOG.map(({ id, title, version, price, release_state, reason, public_sources }) =>
    ({ id, title, version, price, release_state, reason, public_sources, authority_created: false }));
}
export function isReleaseReady(product) {
  return !!product && product.release_state === "RELEASED" &&
    /^[a-f0-9]{64}$/i.test(product.content_sha256 ?? "") &&
    product.price.currency === "usd" && product.price.cents === 100;
}
