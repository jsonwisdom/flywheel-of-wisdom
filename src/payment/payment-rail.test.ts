import { emptyEvidence, USDC_BASE, PAY_TO_DEFAULT, ERC20_TRANSFER_TOPIC0 } from "./payment-evidence";
import { verifySettlementTx, type RpcClient, type RpcReceipt } from "./base-rpc-verifier";
import { emptyLedger, reconcilePayment } from "./payment-reconciliation";

const HASH = "0x" + "11".repeat(32);
const OTHER = "0x" + "22".repeat(32);
const PAD = "0x" + "00".repeat(12);

function transferLog(to: string, amountHex: string, token = USDC_BASE) {
  return {
    address: token,
    topics: [ERC20_TRANSFER_TOPIC0, PAD + "aa".repeat(20), PAD + to.slice(2)],
    data: "0x" + amountHex.padStart(64, "0"),
    logIndex: 0,
  };
}

function goodReceipt(over: Partial<NonNullable<RpcReceipt>> = {}): NonNullable<RpcReceipt> {
  return {
    status: "0x1",
    blockNumber: "0x10",
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

async function main() {
  if ((await verifySettlementTx(null, "obj-1", rpc(null))).state !== "UNPAID_KNOWLEDGE_402") throw new Error("NO_HASH");
  if ((await verifySettlementTx("0xbad", "obj-1", rpc(null))).reason !== "BAD_HASH") throw new Error("BAD_HASH");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(null))).reason !== "NOT_FOUND") throw new Error("NOT_FOUND");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt({ status: "0x0" })))).reason !== "REVERTED") throw new Error("REVERTED");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt(), 1))).reason !== "WRONG_CHAIN") throw new Error("WRONG_CHAIN");
  const lookalike = "0xd9aa0ba3972341ba3972341ba3972341ba397234";
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt({ logs: [transferLog(PAY_TO_DEFAULT, (1000000).toString(16), lookalike)] })))).reason !== "TRANSFER_MISMATCH") throw new Error("WRONG_TOKEN");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt({ logs: [transferLog("0x" + "00".repeat(20), (1000000).toString(16))] })))).reason !== "TRANSFER_MISMATCH") throw new Error("WRONG_PAY_TO");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt({ logs: [transferLog(PAY_TO_DEFAULT, (999999).toString(16))] })))).reason !== "TRANSFER_MISMATCH") throw new Error("AMT-1");
  if ((await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt({ logs: [transferLog(PAY_TO_DEFAULT, (1000001).toString(16))] })))).reason !== "TRANSFER_MISMATCH") throw new Error("AMT+1");
  const ok = await verifySettlementTx(HASH, "obj-1", rpc(goodReceipt()));
  if (ok.state !== "PAYMENT_RECEIVED_PENDING_RECONCILIATION") throw new Error("PASS");
  let ledger = emptyLedger();
  const r1 = reconcilePayment(ok.evidence, ledger);
  if (r1.result !== "BOOKED" || r1.ledger.revenue_usd !== 1) throw new Error("BOOK");
  ledger = r1.ledger;
  const r2 = reconcilePayment(ok.evidence, ledger);
  if (r2.result !== "ALREADY_BOOKED" || r2.ledger.revenue_usd !== 1) throw new Error("DUP");
  const otherObj = await verifySettlementTx(HASH, "obj-2", rpc(goodReceipt()));
  if (reconcilePayment(otherObj.evidence, ledger).result !== "ALREADY_BOOKED") throw new Error("REPLAY_OBJ");
  if (reconcilePayment(emptyEvidence("x"), ledger).result !== "NOT_ELIGIBLE") throw new Error("SKIP");
  const otherTx = await verifySettlementTx(OTHER, "obj-3", rpc(goodReceipt()));
  if (reconcilePayment(otherTx.evidence, ledger).result !== "BOOKED") throw new Error("SECOND");
  console.log("payment-rail.test.ts ok");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
