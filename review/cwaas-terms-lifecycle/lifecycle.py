"""Synthetic-only SQLite lifecycle harness. No payment API, RPC, wallet or delivery network."""
from copy import deepcopy
import hashlib
import json
import re
import sqlite3
from terms_validator import validate_terms, terms_hash, canonical_bytes, validate_pin, pin_order

def sha(data):return hashlib.sha256(data).hexdigest()
def integer(value):return type(value) is int and 0<=value<=9007199254740991

class FixtureRegistry:
    """Trusted test-harness dependency, NOT an authenticated production verifier."""
    def __init__(self, records):self._records=deepcopy(records)
    def verified_fixture(self, reference):
        if type(reference) is not str or not reference:raise ValueError('FIXTURE_REFERENCE_REQUIRED')
        result=self._records.get(reference)
        if result is None:raise ValueError('UNKNOWN_FIXTURE_EVIDENCE')
        return deepcopy(result)

def catalog_readiness(price, product, explicit_terms_mapping=None):
    """Inspect price evidence; NEVER infer wallet/network/version/scope from a USD price."""
    observed=(price.get('active') is True and price.get('livemode') is True and
        price.get('currency')=='usd' and price.get('unit_amount')==8900 and
        price.get('type')=='one_time' and price.get('product')==product.get('id') and
        product.get('active') is True)
    if not observed:return {'price_gate':'FAIL','order_binding_readiness':'FAIL','reason':'PRICE_EVIDENCE_MISMATCH'}
    required=['product_version','terms_sha256','delivery_acceptance_criteria','settlement_rail',
              'approved_recipient','commercial_approval_evidence']
    mapping=explicit_terms_mapping or {}
    missing=[key for key in required if not mapping.get(key)]
    return {'price_gate':'PASS','order_binding_readiness':'FAIL' if missing else 'UNKNOWN',
      'reason':'MISSING_EXPLICIT_TERMS_BINDING' if missing else 'MAPPING_REQUIRES_INDEPENDENT_VERIFICATION',
      'missing':missing,'currency':'usd','minor_units':8900,
      'note':'USD cents are not USDC atomic units; price evidence is not payment or delivery evidence.'}

class Harness:
    def __init__(self,catalog,payment_verifier,acceptance_verifier):
        self.catalog=deepcopy(catalog)
        self.payments=payment_verifier;self.acceptance=acceptance_verifier
        self.db=sqlite3.connect(':memory:');self.db.row_factory=sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript('''
        CREATE TABLE orders(order_id TEXT PRIMARY KEY, terms_json TEXT NOT NULL, terms_hash TEXT NOT NULL,
         payer TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('CREATED','PAYMENT_VERIFIED','DELIVERED')),
         settlement_tx TEXT,log_index INTEGER,network TEXT,settlement_hash TEXT,
         UNIQUE(network,settlement_tx,log_index));
        CREATE TABLE deliveries(order_id TEXT PRIMARY KEY REFERENCES orders(order_id),
         artifact_hash TEXT NOT NULL,criteria_hash TEXT NOT NULL,acceptance_reference TEXT NOT NULL);
        CREATE TABLE accounting(order_id TEXT PRIMARY KEY REFERENCES orders(order_id),
         proceeds_atomic INTEGER NOT NULL,costs_json TEXT NOT NULL);
        CREATE TRIGGER immutable_terms BEFORE UPDATE OF terms_json,terms_hash,payer ON orders
         BEGIN SELECT RAISE(ABORT,'IMMUTABLE_ORDER_BINDING'); END;
        CREATE TRIGGER immutable_delivery BEFORE UPDATE ON deliveries
         BEGIN SELECT RAISE(ABORT,'IMMUTABLE_DELIVERY'); END;
        ''')

    def close(self):self.db.close()
    def order(self,order_id):
        row=self.db.execute('SELECT * FROM orders WHERE order_id=?',(order_id,)).fetchone()
        if row is None:raise ValueError('UNKNOWN_ORDER')
        return row

    def create(self,order_id,candidate,payer):
        if not re.fullmatch(r'0x[0-9a-fA-F]{40}',payer) or payer.lower()=='0x'+'0'*40:
            raise ValueError('INVALID_PAYER')
        pin=pin_order(order_id,candidate,self.catalog)
        terms=validate_terms(candidate,self.catalog)
        prior=self.db.execute('SELECT * FROM orders WHERE order_id=?',(order_id,)).fetchone()
        if prior:
            if prior['terms_hash']==pin.terms_sha256 and prior['payer']==payer.lower():return pin.model_dump()
            raise ValueError('ORDER_ID_CONFLICT')
        with self.db:
            self.db.execute('INSERT INTO orders(order_id,terms_json,terms_hash,payer,state) VALUES(?,?,?,?,?)',
                (order_id,canonical_bytes(terms).decode(),pin.terms_sha256,payer.lower(),'CREATED'))
        return pin.model_dump()

    def _bound(self,order_id,pin):
        row=self.order(order_id);candidate=json.loads(row['terms_json'])
        order=validate_pin(pin,candidate,self.catalog)
        if order.order_id!=order_id or order.terms_sha256!=row['terms_hash']:
            raise ValueError('ORDER_PIN_MISMATCH')
        return row,validate_terms(candidate,self.catalog)

    def settle(self,order_id,pin,evidence_reference):
        row,terms=self._bound(order_id,pin)
        proof=self.payments.verified_fixture(evidence_reference)
        expected={'mode':'SYNTHETIC_ONLY','result':'FIXTURE_VERIFIED','order_id':order_id,
          'terms_sha256':row['terms_hash'],'asset':terms.price.asset,'network':terms.price.network,
          'payer':row['payer'],'recipient':terms.approved_recipient,
          'amount_atomic':terms.price.amount_atomic}
        if any(proof.get(k)!=v for k,v in expected.items()):raise ValueError('SETTLEMENT_CONTRACT_MISMATCH')
        if type(proof.get('amount_atomic')) is not int:raise ValueError('INVALID_SETTLEMENT_AMOUNT')
        if not integer(proof.get('log_index')):raise ValueError('EXPLICIT_LOG_INDEX_REQUIRED')
        if not re.fullmatch(r'0x[0-9a-f]{64}',proof.get('tx_hash','')):raise ValueError('INVALID_TRANSACTION')
        fingerprint=sha(json.dumps(proof,sort_keys=True,separators=(',',':')).encode())
        if row['state'] in ('PAYMENT_VERIFIED','DELIVERED'):
            if row['settlement_hash']==fingerprint:return 'ALREADY_SETTLED'
            raise ValueError('SETTLEMENT_CONFLICT')
        with self.db:
            changed=self.db.execute("""UPDATE orders SET state='PAYMENT_VERIFIED',settlement_tx=?,
              log_index=?,network=?,settlement_hash=? WHERE order_id=? AND state='CREATED'
              AND settlement_tx IS NULL AND terms_hash=?""",
              (proof['tx_hash'],proof['log_index'],proof['network'],fingerprint,order_id,row['terms_hash'])).rowcount
            if changed!=1:raise ValueError('SETTLEMENT_CONFLICT')
        return 'SYNTHETIC_PAYMENT_VERIFIED'

    @staticmethod
    def criteria_hash(terms):
        return sha(json.dumps([c.model_dump() for c in terms.delivery.acceptance_criteria],
                             sort_keys=True,separators=(',',':')).encode())

    def deliver(self,order_id,pin,artifact,acceptance_reference):
        row,terms=self._bound(order_id,pin)
        if row['state'] not in ('PAYMENT_VERIFIED','DELIVERED') or not row['settlement_hash']:
            raise ValueError('SETTLEMENT_REQUIRED')
        if type(artifact) is not bytes:raise ValueError('ARTIFACT_BYTES_REQUIRED')
        digest=sha(artifact);criteria=self.criteria_hash(terms)
        if terms.delivery.artifact_hash_when_available and digest!=terms.delivery.artifact_hash_when_available:
            raise ValueError('PROMISED_ARTIFACT_MISMATCH')
        accepted=self.acceptance.verified_fixture(acceptance_reference)
        expected={'mode':'SYNTHETIC_ONLY','result':'FIXTURE_ACCEPTED','order_id':order_id,
                  'terms_sha256':row['terms_hash'],'artifact_sha256':digest,'criteria_sha256':criteria,
                  'accepted_criteria':[c.criterion_id for c in terms.delivery.acceptance_criteria]}
        if any(accepted.get(k)!=v for k,v in expected.items()):raise ValueError('ACCEPTANCE_EVIDENCE_MISMATCH')
        prior=self.db.execute('SELECT * FROM deliveries WHERE order_id=?',(order_id,)).fetchone()
        if prior:
            if (prior['artifact_hash'],prior['criteria_hash'],prior['acceptance_reference'])==(digest,criteria,acceptance_reference):
                return 'ALREADY_DELIVERED'
            raise ValueError('DELIVERY_CONFLICT')
        # Actual SQLite transaction: a failed order update rolls back the delivery insert.
        with self.db:
            self.db.execute('INSERT INTO deliveries VALUES(?,?,?,?)',(order_id,digest,criteria,acceptance_reference))
            changed=self.db.execute("UPDATE orders SET state='DELIVERED' WHERE order_id=? AND state='PAYMENT_VERIFIED' AND terms_hash=?",
                                    (order_id,row['terms_hash'])).rowcount
            if changed!=1:raise ValueError('DELIVERY_CONFLICT')
        return 'SYNTHETIC_DELIVERED'

    def record_accounting(self,order_id,pin,proceeds_atomic,cost_entries):
        row,terms=self._bound(order_id,pin)
        if row['state']!='DELIVERED':raise ValueError('DELIVERY_REQUIRED')
        if not integer(proceeds_atomic) or proceeds_atomic!=terms.price.amount_atomic:
            raise ValueError('PROCEEDS_MISMATCH')
        if type(cost_entries) is not list or not cost_entries:raise ValueError('EXPLICIT_COST_RECORD_REQUIRED')
        ids=set()
        for cost in cost_entries:
            if set(cost)!={'evidence_id','category','amount_atomic','asset','network'} or not integer(cost['amount_atomic']):
                raise ValueError('INVALID_COST_RECORD')
            if type(cost['evidence_id']) is not str or not cost['evidence_id'] or cost['evidence_id'] in ids or type(cost['category']) is not str or not cost['category']:
                raise ValueError('DUPLICATE_OR_MISSING_COST_EVIDENCE')
            if cost['asset']!=terms.price.asset or cost['network']!=terms.price.network:
                raise ValueError('COST_UNIT_MISMATCH')
            ids.add(cost['evidence_id'])
        with self.db:self.db.execute('INSERT INTO accounting VALUES(?,?,?)',
            (order_id,proceeds_atomic,json.dumps(cost_entries,sort_keys=True)))

    def reconciliation(self,order_id):
        row=self.order(order_id);cash=self.db.execute('SELECT * FROM accounting WHERE order_id=?',(order_id,)).fetchone()
        delivery=self.db.execute('SELECT 1 FROM deliveries WHERE order_id=?',(order_id,)).fetchone()
        if row['state']!='DELIVERED' or not row['settlement_hash'] or not delivery or not cash:
            return {'status':'UNVERIFIED','mode':'SYNTHETIC_ONLY','profit_claim':False}
        costs=sum(c['amount_atomic'] for c in json.loads(cash['costs_json']))
        return {'status':'SYNTHETIC_RECONCILED','mode':'SYNTHETIC_ONLY','proceeds_atomic':cash['proceeds_atomic'],
                'recorded_costs_atomic':costs,'synthetic_remainder_atomic':cash['proceeds_atomic']-costs,
                'profit_claim':False}
