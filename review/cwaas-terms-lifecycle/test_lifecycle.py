from copy import deepcopy
from pathlib import Path
import json
import sqlite3
import unittest
from lifecycle import Harness,FixtureRegistry,catalog_readiness,sha
from terms_validator import load_json,validate_terms,terms_hash

CATALOG=load_json(Path(__file__).resolve().parent/'fixtures/trusted_synthetic_catalog.json')
PAYER='0x'+'a'*40
ARTIFACT=b'SYNTHETIC_FIXTURE_REPORT: test marker only\n'

def fixture(product_index=1):
    terms=deepcopy(CATALOG['approved_terms'][product_index]);digest=terms_hash(validate_terms(terms,CATALOG))
    payment={'mode':'SYNTHETIC_ONLY','result':'FIXTURE_VERIFIED','order_id':'fixture-order-1',
      'terms_sha256':digest,'asset':'USDC','network':terms['price']['network'],'payer':PAYER,
      'recipient':terms['approved_recipient'],'amount_atomic':terms['price']['amount_atomic'],
      'tx_hash':'0x'+'b'*64,'log_index':7}
    accepted={'mode':'SYNTHETIC_ONLY','result':'FIXTURE_ACCEPTED','order_id':'fixture-order-1',
      'terms_sha256':digest,'artifact_sha256':sha(ARTIFACT),
      'criteria_sha256':Harness.criteria_hash(validate_terms(terms,CATALOG)),
      'accepted_criteria':[c['criterion_id'] for c in terms['delivery']['acceptance_criteria']]}
    h=Harness(CATALOG,FixtureRegistry({'payment-1':payment}),FixtureRegistry({'acceptance-1':accepted}))
    pin=h.create('fixture-order-1',terms,PAYER)
    return h,pin,terms

class LifecycleTests(unittest.TestCase):
    def setUp(self):self.h,self.pin,self.terms=fixture()
    def tearDown(self):self.h.close()
    def settle(self):return self.h.settle('fixture-order-1',self.pin,'payment-1')
    def deliver(self):return self.h.deliver('fixture-order-1',self.pin,ARTIFACT,'acceptance-1')

    def test_successful_synthetic_lifecycle(self):
        self.assertEqual(self.settle(),'SYNTHETIC_PAYMENT_VERIFIED')
        self.assertEqual(self.deliver(),'SYNTHETIC_DELIVERED')
        self.assertEqual(self.h.order('fixture-order-1')['state'],'DELIVERED')

    def test_duplicate_order_request(self):
        self.assertEqual(self.h.create('fixture-order-1',self.terms,PAYER),self.pin)
        self.assertEqual(self.h.db.execute('SELECT count(*) FROM orders').fetchone()[0],1)

    def test_duplicate_order_different_payer_conflicts(self):
        with self.assertRaisesRegex(ValueError,'ORDER_ID_CONFLICT'):
            self.h.create('fixture-order-1',self.terms,'0x'+'c'*40)

    def test_duplicate_settlement_request(self):
        self.settle();self.assertEqual(self.settle(),'ALREADY_SETTLED')

    def test_duplicate_delivery_request(self):
        self.settle();self.deliver();self.assertEqual(self.deliver(),'ALREADY_DELIVERED')
        self.assertEqual(self.h.db.execute('SELECT count(*) FROM deliveries').fetchone()[0],1)

    def test_delivery_without_settlement(self):
        with self.assertRaisesRegex(ValueError,'SETTLEMENT_REQUIRED'):self.deliver()
        self.assertEqual(self.h.db.execute('SELECT count(*) FROM deliveries').fetchone()[0],0)

    def test_receipt_flags_from_client_are_not_evidence(self):
        with self.assertRaisesRegex(ValueError,'FIXTURE_REFERENCE_REQUIRED'):
            self.h.settle('fixture-order-1',self.pin,{'receipt_verified':True})

    def test_unregistered_receipt_rejected(self):
        with self.assertRaisesRegex(ValueError,'UNKNOWN_FIXTURE_EVIDENCE'):
            self.h.settle('fixture-order-1',self.pin,'unknown')

    def test_reused_transfer_cannot_settle_second_order(self):
        self.settle();pin=self.h.create('fixture-order-2',self.terms,PAYER)
        other=deepcopy(self.h.payments._records['payment-1']);other['order_id']='fixture-order-2'
        self.h.payments._records['payment-2']=other
        with self.assertRaises(sqlite3.IntegrityError):self.h.settle('fixture-order-2',pin,'payment-2')
        self.assertEqual(self.h.order('fixture-order-2')['state'],'CREATED')

    def test_stale_pin_blocks_settlement(self):
        with self.assertRaisesRegex(ValueError,'ORDER_TERMS_PIN_MISMATCH'):
            self.h.settle('fixture-order-1',{**self.pin,'terms_sha256':'0'*64},'payment-1')

    def test_changed_terms_catalog_blocks_existing_pin(self):
        self.h.catalog['approved_terms'][1]['delivery']['artifact_or_service']='Changed scope'
        with self.assertRaisesRegex(ValueError,'TERMS_CONTRACT_MISMATCH'):self.settle()

    def test_immutable_persisted_terms(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.h.db.execute("UPDATE orders SET terms_hash='tampered'")

    def test_modified_artifact_rejected(self):
        self.settle()
        with self.assertRaisesRegex(ValueError,'ACCEPTANCE_EVIDENCE_MISMATCH'):
            self.h.deliver('fixture-order-1',self.pin,ARTIFACT+b'tamper','acceptance-1')

    def test_changed_acceptance_criteria_rejected(self):
        self.settle();self.h.acceptance._records['acceptance-1']['criteria_sha256']='0'*64
        with self.assertRaisesRegex(ValueError,'ACCEPTANCE_EVIDENCE_MISMATCH'):self.deliver()

    def test_missing_acceptance_criterion_rejected(self):
        self.settle();self.h.acceptance._records['acceptance-1']['accepted_criteria']=[]
        with self.assertRaisesRegex(ValueError,'ACCEPTANCE_EVIDENCE_MISMATCH'):self.deliver()

    def test_atomic_delivery_insert_rolls_back_on_transition_failure(self):
        self.settle()
        self.h.db.execute("""CREATE TRIGGER test_fail_transition BEFORE UPDATE OF state ON orders
          WHEN NEW.state='DELIVERED' BEGIN SELECT RAISE(ABORT,'TEST_ROLLBACK'); END""")
        with self.assertRaises(sqlite3.IntegrityError):self.deliver()
        self.assertEqual(self.h.db.execute('SELECT count(*) FROM deliveries').fetchone()[0],0)
        self.assertEqual(self.h.order('fixture-order-1')['state'],'PAYMENT_VERIFIED')

    def test_missing_proceeds_and_costs_stays_unverified(self):
        self.settle();self.deliver()
        self.assertEqual(self.h.reconciliation('fixture-order-1')['status'],'UNVERIFIED')

    def test_missing_costs_rejected(self):
        self.settle();self.deliver()
        with self.assertRaisesRegex(ValueError,'EXPLICIT_COST_RECORD_REQUIRED'):
            self.h.record_accounting('fixture-order-1',self.pin,89000000,[])

    def test_recorded_proceeds_and_costs_enable_synthetic_reconciliation(self):
        self.settle();self.deliver()
        costs=[{'evidence_id':'fixture-cost-1','category':'synthetic-compute','amount_atomic':20000,
                'asset':'USDC','network':'eip155:8453'}]
        self.h.record_accounting('fixture-order-1',self.pin,89000000,costs)
        result=self.h.reconciliation('fixture-order-1')
        self.assertEqual(result['status'],'SYNTHETIC_RECONCILED')
        self.assertEqual(result['synthetic_remainder_atomic'],88980000)
        self.assertFalse(result['profit_claim'])

    def test_each_product_is_separate(self):
        for index in range(3):
            with self.subTest(product=index):
                h,pin,_=fixture(index)
                try:
                    self.assertEqual(h.settle('fixture-order-1',pin,'payment-1'),'SYNTHETIC_PAYMENT_VERIFIED')
                    self.assertEqual(h.deliver('fixture-order-1',pin,ARTIFACT,'acceptance-1'),'SYNTHETIC_DELIVERED')
                finally:h.close()

def rejection(change):
    def run(self):
        self.h.payments._records['payment-1'].update(change)
        with self.assertRaises(ValueError):self.settle()
        self.assertEqual(self.h.order('fixture-order-1')['state'],'CREATED')
    return run
for label,change in {
 'wrong_amount':{'amount_atomic':99000000},'wrong_recipient':{'recipient':'0x'+'d'*40},
 'wrong_payer':{'payer':'0x'+'d'*40},'wrong_network':{'network':'eip155:1'},
 'wrong_asset':{'asset':'USD'},'usd_cents_not_usdc':{'amount_atomic':8900},
 'missing_index':{'log_index':None},'negative_index':{'log_index':-1},
 'boolean_index':{'log_index':True},'unverified_fixture':{'result':'PENDING'},
 'wrong_order':{'order_id':'different-order'},'wrong_terms_hash':{'terms_sha256':'0'*64}
}.items():setattr(LifecycleTests,'test_reject_'+label,rejection(change))

class CatalogEvidenceTests(unittest.TestCase):
    def test_price_only_fails_binding_gate(self):
        price={'active':True,'livemode':True,'currency':'usd','unit_amount':8900,'type':'one_time','product':'synthetic-prod'}
        result=catalog_readiness(price,{'id':'synthetic-prod','active':True,'metadata':{}})
        self.assertEqual(result['price_gate'],'PASS');self.assertEqual(result['order_binding_readiness'],'FAIL')
        self.assertIn('approved_recipient',result['missing']);self.assertIn('terms_sha256',result['missing'])

    def test_mapping_claims_alone_never_grant_authority(self):
        price={'active':True,'livemode':True,'currency':'usd','unit_amount':8900,'type':'one_time','product':'synthetic-prod'}
        fields=['product_version','terms_sha256','delivery_acceptance_criteria','settlement_rail','approved_recipient','commercial_approval_evidence']
        result=catalog_readiness(price,{'id':'synthetic-prod','active':True},{key:'assertion-only' for key in fields})
        self.assertEqual(result['order_binding_readiness'],'UNKNOWN')

if __name__=='__main__':unittest.main(verbosity=2)
