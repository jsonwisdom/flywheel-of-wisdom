"""Offline synthetic terms validation. PASS never grants commercial authority."""
from __future__ import annotations
import argparse
import hashlib
import json
from datetime import datetime
from pathlib import Path
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Text = Annotated[str, StringConstraints(min_length=1, max_length=4000, pattern=r'\S')]
Identifier = Annotated[str, StringConstraints(pattern=r'^[a-z][a-z0-9-]{0,79}$')]
Version = Annotated[str, StringConstraints(pattern=r'^v[0-9]+\.[0-9]+\.[0-9]+$')]
Digest = Annotated[str, StringConstraints(pattern=r'^[0-9a-f]{64}$')]
Address = Annotated[str, StringConstraints(pattern=r'^0x[0-9a-fA-F]{40}$')]
ZERO = '0x' + '0' * 40

class StrictRecord(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, frozen=True)

class Price(StrictRecord):
    asset: Literal['USDC']
    amount_atomic: int = Field(gt=0, le=9007199254740991)
    network: Annotated[str, StringConstraints(pattern=r'^eip155:[1-9][0-9]*$')]

class Criterion(StrictRecord):
    criterion_id: Identifier
    description: Text

class Delivery(StrictRecord):
    artifact_or_service: Text
    acceptance_criteria: list[Criterion] = Field(min_length=1, max_length=100)
    delivery_method: Text
    deadline: str = Field(json_schema_extra={'format': 'date-time'})
    artifact_hash_when_available: Digest | None = None

    @field_validator('deadline')
    @classmethod
    def valid_deadline(cls, value):
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError('deadline must include a timezone')
        return value

    @field_validator('acceptance_criteria')
    @classmethod
    def unique_criteria(cls, value):
        ids = [item.criterion_id for item in value]
        if len(ids) != len(set(ids)):
            raise ValueError('duplicate acceptance criterion')
        return value

class Terms(StrictRecord):
    schema_version: Literal['cwaas.synthetic_terms.v1']
    mode: Literal['SYNTHETIC_ONLY']
    product_id: Identifier
    product_version: Version
    description: Text
    price: Price
    approved_recipient: Address = Field(json_schema_extra={'not': {'const': ZERO}})
    delivery: Delivery
    refund_and_failure_terms: Text
    terms_approval_evidence: Literal['SYNTHETIC_FIXTURE_NOT_HUMAN_APPROVAL']
    activation_authorization: Literal['DISABLED']

    @field_validator('approved_recipient')
    @classmethod
    def nonzero_address(cls, value):
        if value.lower() == ZERO:
            raise ValueError('zero recipient forbidden')
        return value

class Catalog(StrictRecord):
    schema_version: Literal['cwaas.synthetic_catalog.v1']
    approved_terms: list[Terms] = Field(min_length=1)

class OrderPin(StrictRecord):
    schema_version: Literal['cwaas.synthetic_order_pin.v1']
    mode: Literal['SYNTHETIC_ONLY']
    order_id: Identifier
    product_id: Identifier
    product_version: Version
    terms_sha256: Digest

def load_json(path):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('duplicate JSON key: ' + key)
            result[key] = value
        return result
    def invalid_number(value):
        raise ValueError('non-finite JSON number: ' + value)
    return json.loads(Path(path).read_text(encoding='utf-8'), object_pairs_hook=unique,
                      parse_constant=invalid_number)

def canonical_bytes(terms: Terms):
    # Explicit application format, NOT a claim of RFC 8785/JCS conformance.
    # Optional unavailable artifact hashes are omitted. Required fields cannot be null.
    return json.dumps(terms.model_dump(mode='json', exclude_none=True), sort_keys=True,
                      ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')

def terms_hash(terms: Terms):
    return hashlib.sha256(canonical_bytes(terms)).hexdigest()

def validate_terms(candidate, trusted_catalog):
    """Catalog must be supplied by the trusted test harness, never from candidate JSON."""
    terms = Terms.model_validate(candidate)
    catalog = Catalog.model_validate(trusted_catalog)
    ids = [t.product_id for t in catalog.approved_terms]
    if len(ids) != len(set(ids)):
        raise ValueError('AMBIGUOUS_CATALOG_PRODUCT')
    matches = [t for t in catalog.approved_terms if t.product_id == terms.product_id]
    if len(matches) != 1:
        raise ValueError('UNAPPROVED_PRODUCT')
    approved = matches[0]
    if terms.product_version != approved.product_version:
        raise ValueError('UNAPPROVED_VERSION')
    if terms.price != approved.price:
        raise ValueError('PRICE_OR_NETWORK_CONTRACT_MISMATCH')
    if terms.approved_recipient != approved.approved_recipient:
        raise ValueError('RECIPIENT_CONTRACT_MISMATCH')
    if terms_hash(terms) != terms_hash(approved):
        raise ValueError('TERMS_CONTRACT_MISMATCH')
    return terms

def pin_order(order_id, candidate, catalog):
    terms = validate_terms(candidate, catalog)
    return OrderPin(schema_version='cwaas.synthetic_order_pin.v1',mode='SYNTHETIC_ONLY',
                    order_id=order_id,product_id=terms.product_id,
                    product_version=terms.product_version,terms_sha256=terms_hash(terms))

def validate_pin(pin, candidate, catalog):
    terms = validate_terms(candidate, catalog)
    order = OrderPin.model_validate(pin)
    if (order.product_id,order.product_version,order.terms_sha256) != (
            terms.product_id,terms.product_version,terms_hash(terms)):
        raise ValueError('ORDER_TERMS_PIN_MISMATCH')
    return order

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('candidate',type=Path)
    parser.add_argument('--catalog',type=Path,required=True)
    parser.add_argument('--order-pin',type=Path)
    args = parser.parse_args()
    try:
        candidate,catalog = load_json(args.candidate),load_json(args.catalog)
        terms = validate_terms(candidate,catalog)
        if args.order_pin:
            validate_pin(load_json(args.order_pin),candidate,catalog)
        print(json.dumps({'verdict':'PASS','scope':'SYNTHETIC_CONTRACT_ONLY',
            'terms_sha256':terms_hash(terms),'activation_authorization':'DISABLED'}))
        return 0
    except (ValueError,TypeError,OSError) as error:
        print(json.dumps({'verdict':'FAIL','error':str(error),'activation_authorization':'DISABLED'}))
        return 1

if __name__ == '__main__':
    raise SystemExit(main())
