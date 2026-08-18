const JSONWISDOM_MERCHANT_ID = 5624520187;

function validateOrderReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') errors.push('receipt_required');
  if (!String(receipt?.order_id || '').trim()) errors.push('order_id_required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(receipt?.email || ''))) errors.push('valid_email_required');
  if (!/^[A-Z]{2}$/.test(String(receipt?.delivery_country || ''))) errors.push('iso_country_required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(receipt?.estimated_delivery_date || ''))) errors.push('estimated_delivery_date_required');
  if (errors.length) throw new Error(errors.join(','));
}

function renderSurveyOptIn(receipt) {
  window.gapi.load('surveyoptin', function () {
    const payload = {
      merchant_id: JSONWISDOM_MERCHANT_ID,
      order_id: String(receipt.order_id),
      email: String(receipt.email),
      delivery_country: String(receipt.delivery_country),
      estimated_delivery_date: String(receipt.estimated_delivery_date),
      opt_in_style: receipt.opt_in_style || 'CENTER_DIALOG'
    };

    if (Array.isArray(receipt.products) && receipt.products.length) {
      payload.products = receipt.products
        .filter(p => p && p.gtin)
        .map(p => ({ gtin: String(p.gtin) }));
    }

    window.gapi.surveyoptin.render(payload);
  });
}

window.initGoogleCustomerReviews = function initGoogleCustomerReviews(receipt) {
  validateOrderReceipt(receipt);
  window.renderJsonWisdomGcrOptIn = function () { renderSurveyOptIn(receipt); };

  const existing = document.querySelector('script[data-jsonwisdom-gcr]');
  if (existing) {
    if (window.gapi) renderSurveyOptIn(receipt);
    return;
  }

  const script = document.createElement('script');
  script.src = 'https://apis.google.com/js/platform.js?onload=renderJsonWisdomGcrOptIn';
  script.async = true;
  script.defer = true;
  script.dataset.jsonwisdomGcr = '1';
  document.body.appendChild(script);
};
