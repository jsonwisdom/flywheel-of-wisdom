import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyEvidence, USDC_BASE, PAY_TO_DEFAULT, ERC20_TRANSFER_TOPIC0 } from "./payment-evidence";
import { verifySettlementTx, type RpcClient, type RpcReceipt } from "./base-rpc-verifier";
import { emptyLedger, reconcileDurable, reconcilePayment } from "./payment-reconciliation";

const HASH = "0x" + "11".repeat(32);
const OTHER = "0x" + "22".repeat(32);
const PAYER = "0x" + "aa".repeat(20);
const OTHER_PAYER = "0x" + "bb".repeat(20);
const REQ = "req-1";

function transferLog(to: string, amountHex: string, from = PAYER, token = USDC_BASE) {
  return {
    address: token,
    topics: [ERC20_TRANSFER_TOPIC0, "0x" + from.slice(2).padStart(64, "0"), "0x" + to.slice(2).padStart(64, "0")],
    data: "0x" + amountHex.padStart(64, "0"),
    logIndex: 0,
  };
}

function goodReceipt(over: Partial<NonNullable<RpcReceipt>> = {}): NonNullable<RpcReceipt> {
  return {
    status: "0x1",
    blockNumber: "0x10",
    blockHash: "0x" + "ab".repeat(32),
    logs: [transferLog(PAY_TO_DEFAULT, (1000000).toString(16))],
    ...over,
  };
}

function rpc(receipt: RpcReceipt, chainId = 8453): RpcClient {
  return {
    chainId: async () => chainId,
    getReceipt: async () => receipt,
    blockNumber: async () => 20,
  };
}

const bound = { expectedPayer: PAYER, requestId: REQ };

async function main() {
  if ((await verifySettlementTx(null, "obj-1", rpc(null), bound)).state !== "UNPAID_KNOWLEDGE_402") throw new Error("NO_HASH");
  if ((await verifySettlementTx("0xbad", "obj-1", rpc(null), bound)).reason !== "BAD_HASH") throw new Error("BAD_HASH");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt()))).reason !== "PAYER_UNBOUND") throw new Error("PAYER_UNBOUND");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt()), { expectedPayer: PAYER })).reason !== "REQUEST_UNBOUND") throw new Error("REQUEST_UNBOUND");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(null), bound)).reason !== "NOT_FOUND") throw new Error("NOT_FOUND");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt({ status: "0x0" })), bound)).reason !== "REVERTED") throw new Error("REVERTED");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt(), 1), bound)).reason !== "WRONG_CHAIN") throw new Error("WRONG_CHAIN");
  const lookalike = "0xd9aa0ba3972341ba3972341ba3972341ba397234";
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt({ logs: [transferLog(PAY_TO_DEFAULT, (1000000).toString(16), PAYER, lookalike)] })), bound)).reason !== "TRANSFER_MISMATCH") throw new Error("WRONG_TOKEN");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt({ logs: [transferLog("0x" + "00".repeat(20), (1000000).toString(16))] })), bound)).reason !== "TRANSFER_MISMATCH") throw new Error("WRONG_PAY_TO");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt({ logs: [transferLog(PAY_TO_DEFAULT, (1000000).toString(16), OTHER_PAYER)] })), bound)).reason !== "WRONG_PAYER") throw new Error("WRONG_PAYER");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt({ logs: [transferLog(PAY_TO_DEFAULT, (999999).toString(16))] })), bound)).reason !== "TRANSFER_MISMATCH") throw new Error("AMT-1");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt({ logs: [transferLog(PAY_TO_DEFAULT, (1000001).toString(16))] })), bound)).reason !== "TRANSFER_MISMATCH") throw new Error("AMT+1");
  const ok = await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt()), bound);
  if (ok.state !== "PAYMENT_RECEIVED_PENDING_RECONCILIATION") throw new Error("PASS");
  if (ok.evidence.payer !== PAYER) throw new Error("PAYER");
  if (ok.evidence.request_id !== REQ) throw new Error("REQ");
  if (!ok.evidence.block_hash) throw new Error("BLOCK_HASH");
  let ledger = emptyLedger();
  const r1 = reconcilePayment(ok.evidence, ledger);
  if (r1.result !== "BOOKED" || r1.ledger.revenue_usd !== 1) throw new Error("BOOK");
  ledger = r1.ledger;
  const r2 = reconcilePayment(ok.evidence, ledger);
  if (r2.result !== "ALREADY_BOOKED" || r2.ledger.revenue_usd !== 1) throw new Error("DUP");
  const otherObj = await verifySettlementTx(HASH, "obj-2", rpc(goodReceipt()), bound);
  if (reconcilePayment(otherObj.evidence, ledger).result !== "ALREADY_BOOKED") throw new Error("REPLAY_OBJ");
  if (reconcilePayment(emptyEvidence("x"), ledger).result !== "NOT_ELIGIBLE") throw new Error("SKIP");
  const otherTx = await verifySettlementTx(OTHER, "obj-3", rpc(goodReceipt()), { ...bound, requestId: "req-3" });
  if (reconcilePayment(otherTx.evidence, ledger).result !== "BOOKED") throw new Error("SECOND");
  const dir = mkdtempSync(join(tmpdir(), "flywheel-ledger-"));
  const path = join(dir, "ledger.json");
  const d1 = reconcileDurable(ok.evidence, path);
  if (d1.result !== "BOOKED") throw new Error("DURABLE_BOOK");
  const d2 = reconcileDurable(ok.evidence, path);
  if (d2.result !== "ALREADY_BOOKED" || d2.ledger.revenue_usd !== 1) throw new Error("DURABLE_RESTART");
  console.log("payment-rail.test.ts ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
