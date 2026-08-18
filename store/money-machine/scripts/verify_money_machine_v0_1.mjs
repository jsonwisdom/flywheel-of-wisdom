import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'policy/JAY_ONLY_PROFIT_POLICY_V0_1.json'), 'utf8'));
const suite = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/PROFIT_ROUTING_TEST_VECTORS_V0_1.json'), 'utf8'));
const wallet = JSON.parse(fs.readFileSync(path.join(root, 'wallet/PUBLIC_ADDRESS_OBSERVATION_V0_1.json'), 'utf8'));
const contract = JSON.parse(fs.readFileSync(path.join(root, 'openai/agent_contract.json'), 'utf8'));

function profit(v) {
  const deductions = v.refunds + v.chargebacks + v.taxes_not_earned + v.processor_fees + v.direct_costs;
  return Math.max(0, v.gross - deductions);
}

if (policy.beneficiaries.length !== 1) throw new Error('Exactly one project profit beneficiary required');
if (policy.beneficiaries[0].id !== 'JAY') throw new Error('Beneficiary must be JAY');
if (policy.beneficiaries[0].profit_share_bps !== 10000) throw new Error('Jay share must be 10000 bps');
if (policy.other_profit_share_bps !== 0) throw new Error('Other share must be zero');
if (policy.automatic_accounting !== true) throw new Error('Automatic accounting must be true');
if (policy.automatic_payout !== false) throw new Error('Automatic payout must remain false');
if (policy.payment_processor_live !== false) throw new Error('Payment processor must remain false');
if (policy.beneficiaries[0].payout_address_control_verified !== false) throw new Error('Wallet control cannot be promoted');
if (policy.authority_created !== false) throw new Error('Authority must remain false');

if (wallet.observations.eas_base.total_attestations !== 54) throw new Error('EAS observation mismatch');
if (wallet.observations.eas_base.attestations_made !== 0) throw new Error('EAS made mismatch');
if (wallet.observations.eas_base.attestations_received !== 54) throw new Error('EAS received mismatch');
if (wallet.observations.base_activity.activity_observed !== true) throw new Error('Base activity must be observed');
if (wallet.observations.asset_indexing.disposition !== 'REJECTED_STALE_OR_INCOMPLETE') throw new Error('Stale zero-asset inventory must be rejected');
if (wallet.wallet_control_verified !== false) throw new Error('Wallet control not verified');

let passed = 0;
for (const v of suite.vectors) {
  const p = profit(v);
  const jay = Math.floor((p * 10000) / 10000);
  if (p !== v.expected_profit) throw new Error(`${v.id}: profit ${p} != ${v.expected_profit}`);
  if (jay !== v.expected_jay_allocation) throw new Error(`${v.id}: Jay ${jay} != ${v.expected_jay_allocation}`);
  passed += 1;
}

if (contract.model_required !== false) throw new Error('Model must be optional');
if (contract.model_execution_performed !== false) throw new Error('No model execution claim');
if (contract.api_key_required_for_core !== false) throw new Error('API key not required for core');
if (contract.authority_created !== false) throw new Error('OpenAI authority false');

console.log(JSON.stringify({
  result: 'PASS',
  vectors: `${passed}/${suite.vectors.length} PASS`,
  automatic_accounting: true,
  automatic_payout: false,
  jay_profit_share_bps: 10000,
  other_profit_share_bps: 0,
  wallet_control_verified: false,
  stale_zero_asset_inventory: 'REJECTED',
  authority_created: false
}, null, 2));
