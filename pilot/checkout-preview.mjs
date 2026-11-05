// CWaaS draft-first checkout preview. NO LIVE MONEY. NO EXTERNAL FETCHES.
// Only in-memory synthetic orders; never use for production customer records.
const textEncoder = new TextEncoder();
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store',
  'x-content-type-options':'nosniff','access-control-allow-origin':'none'}
});
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CWaaS · Checkout Preview</title><style>body{font:16px/1.6 system-ui;background:#0a1728;color:#f0f6ff;margin:0}main{max-width:760px;margin:48px auto;padding:20px}h1{font-size:clamp(2rem,5vw,3.5rem)}.panel{background:#152d40;border:1px solid #52758c;border-radius:16px;padding:24px}a{color:#93e4ff}code{color:#9ae9db}</style><main><small>COMPUTER WISDOM · CI-FIRST</small><h1>Receipt-First Audit</h1><div class="panel"><h2>$99 illustrative storefront tier</h2><p>This is a <strong>development preview only</strong>. Payments are disabled, no personal data is accepted, and no customer order is placed.</p><p>Contract: offer → synthetic acceptance → simulated settlement → report digest → simulated delivery acknowledgment → ledger reconciliation.</p><p><strong>Checkout state: OFF.</strong></p></div><p>Inspect <a href="/api/status">the preview status</a>. Automated tests exercise the synthetic lifecycle offline.</p></main>`;
const order = Object.freeze({id:'SYNTHETIC-ORDER-001',sku:'CW-AUDIT-99',amount_minor:9900,currency:'USD',kind:'synthetic',accepted:true});
async function sha256(s) {
  const bytes=await crypto.subtle.digest('SHA-256', textEncoder.encode(s));
  return Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,'0')).join('');
}
export async function simulate() {
  const report='# Synthetic CWaaS Audit\n\nScope: test fixture only.\nResult: no real customer, payment or delivery.\n';
  const report_sha256=await sha256(report);
  const fakeSettlement={kind:'synthetic',amount_minor:9900,currency:'USD',network:'none',transaction_hash:null};
  const fakeDelivery={kind:'synthetic',delivered:true,customer_acknowledged:true,report_sha256};
  const reconciled = order.amount_minor === fakeSettlement.amount_minor && fakeDelivery.report_sha256 === report_sha256;
  return {mode:'DRY_RUN_ONLY',order,fake_settlement:fakeSettlement,report_sha256:report_sha256,
    delivery:fakeDelivery,reconciled,net_revenue_verified:false,real_payment:false};
}
export default {
  async fetch(request) {
    const url=new URL(request.url);
    if (request.method!=='GET' && request.method!=='HEAD')return json({error:'METHOD_DISABLED',live_payment:false},405);
    if (url.pathname==='/' && request.method==='GET')return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none';style-src 'unsafe-inline';base-uri 'none';form-action 'none';frame-ancestors 'none'"}});
    if (url.pathname==='/api/status')return json({sku:'CW-AUDIT-99',display_price_usd:99,checkout_enabled:false,
      payment_enabled:false,simulation_available:true,real_orders_enabled:false,customer_data_collected:false});
    if (url.pathname==='/api/simulate' && request.method==='GET')return json(await simulate());
    if (url.pathname==='/api/checkout'||url.pathname==='/api/payment'||url.pathname==='/api/order')return json({error:'PAYMENT_AND_ORDER_CREATION_DISABLED',live_payment:false},503);
    return json({error:'NOT_FOUND'},404);
  }
};
