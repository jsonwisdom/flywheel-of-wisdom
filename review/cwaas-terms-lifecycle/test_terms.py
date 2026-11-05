from copy import deepcopy
from pathlib import Path
import json
import tempfile
import unittest
from terms_validator import Terms, load_json, validate_terms, terms_hash, pin_order, validate_pin

ROOT=Path(__file__).resolve().parent
CATALOG=load_json(ROOT/'fixtures/trusted_synthetic_catalog.json')
BASE=CATALOG['approved_terms'][1]

class TermsTests(unittest.TestCase):
    def test_pin_validated_terms(self):
        pin=pin_order('fixture-order-1',BASE,CATALOG)
        self.assertEqual(validate_pin(pin.model_dump(),BASE,CATALOG),pin)

    def test_stale_pin_rejected(self):
        with self.assertRaises(ValueError):
            validate_pin(load_json(ROOT/'fixtures/fail-order-stale-pin.json'),BASE,CATALOG)

    def test_pin_cannot_declare_delivery_or_payment(self):
        pin=pin_order('fixture-order-1',BASE,CATALOG).model_dump()
        for state in ('PAYMENT_VERIFIED','DELIVERED'):
            with self.subTest(state=state),self.assertRaises(ValueError):
                validate_pin({**pin,'state':state},BASE,CATALOG)

    def test_schema_validity_does_not_approve_price(self):
        changed=deepcopy(BASE);changed['price']['amount_atomic']=99000000
        Terms.model_validate(changed)  # Valid JSON shape; wrong trusted product contract.
        with self.assertRaisesRegex(ValueError,'PRICE_OR_NETWORK_CONTRACT_MISMATCH'):
            validate_terms(changed,CATALOG)

    def test_canonical_hash_independent_of_key_order(self):
        reordered=dict(reversed(list(BASE.items())))
        self.assertEqual(terms_hash(Terms.model_validate(BASE)),terms_hash(Terms.model_validate(reordered)))

    def test_scope_mutation_changes_hash_and_breaks_pin(self):
        changed=deepcopy(BASE);changed['delivery']['artifact_or_service']='Changed test report'
        self.assertNotEqual(terms_hash(Terms.model_validate(BASE)),terms_hash(Terms.model_validate(changed)))
        with self.assertRaisesRegex(ValueError,'TERMS_CONTRACT_MISMATCH'):
            validate_terms(changed,CATALOG)

    def test_ambiguous_catalog_rejected(self):
        catalog=deepcopy(CATALOG);catalog['approved_terms'].append(deepcopy(BASE))
        with self.assertRaisesRegex(ValueError,'AMBIGUOUS_CATALOG_PRODUCT'):
            validate_terms(BASE,catalog)

    def test_candidate_cannot_supply_catalog(self):
        with self.assertRaises(ValueError):validate_terms({**BASE,'trusted_catalog':CATALOG},CATALOG)

    def test_duplicate_json_keys_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'duplicate.json';p.write_text('{"amount":89,"amount":99}')
            with self.assertRaisesRegex(ValueError,'duplicate JSON key'):load_json(p)

    def test_nonfinite_json_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'nonfinite.json';p.write_text('{"amount":NaN}')
            with self.assertRaisesRegex(ValueError,'non-finite'):load_json(p)

def fixture_test(case):
    def run(self):
        obj=load_json(ROOT/case['file'])
        if case['expected']=='PASS':validate_terms(obj,CATALOG)
        else:
            with self.assertRaises(ValueError):validate_terms(obj,CATALOG)
    return run
for case in load_json(ROOT/'fixtures/cases.json'):
    setattr(TermsTests,'test_fixture_'+case['name'].replace('-','_'),fixture_test(case))

if __name__=='__main__':unittest.main(verbosity=2)
