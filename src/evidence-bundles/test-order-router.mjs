import { Router } from "express";
import { createStore } from "./test-order-core.mjs";

// Intentionally test-only. Do not mount in a live payment environment.
export function makeEvidenceBundleTestRouter() {
  if (process.env.NODE_ENV !== "test" || process.env.EVIDENCE_BUNDLE_TEST_MODE !== "1") {
    throw new Error("TEST_ROUTER_FORBIDDEN");
  }
  const store=createStore({testMode:true});
  const router=Router();
  router.use((_req,res,next)=>{res.set("Cache-Control","no-store");next();});
  const run=(fn)=>(req,res)=>{
    try {res.json(fn(req));}
    catch(err){res.status(400).json({error:err.message,production_revenue_verified:false});}
  };
  router.post("/orders",run(()=>{const o=store.create();return {draft_id:o.draft_id,order_id:null,order_status:"DRAFT",payment_status:"UNKNOWN",delivery_status:"UNKNOWN",revenue_verified:false};}));
  router.get("/orders/:orderId",run(req=>store.receipt(req.params.orderId)));
  router.post("/orders/:orderId/authorize",run(req=>{const o=store.authorize(req.params.orderId,req.body?.approvals);return {draft_id:o.draft_id,order_id:o.order_id,status:o.status};}));
  router.post("/orders/:orderId/test-settle",run(req=>{const o=store.testSettle(req.params.orderId);return {status:o.status,mode:"TEST",funds_moved:false,test_settlement_reference:o.test_settlement_reference,production_revenue_verified:false};}));
  router.post("/orders/:orderId/manifest",run(req=>{const o=store.manifest(req.params.orderId,req.body?.documents);return {status:o.status,sources:o.sources.map(({bytes_base64,...s})=>s)};}));
  router.post("/orders/:orderId/bundle",run(req=>{const o=store.hashBundle(req.params.orderId,req.body?.bytes_base64);return {status:o.status,bundle_sha256:o.bundle_sha256};}));
  router.post("/orders/:orderId/deliver",run(req=>{const o=store.deliver(req.params.orderId,req.body?.receipt);return {status:o.status,delivery_status:o.delivery_status};}));
  router.post("/orders/:orderId/replay",run(req=>store.replay(req.params.orderId)));
  router.get("/orders/:orderId/receipt",run(req=>store.receipt(req.params.orderId)));
  return router;
}
