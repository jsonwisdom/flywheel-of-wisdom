"""Generate explicitly synthetic test data and schema; never fills real commercial terms."""
from pathlib import Path
from copy import deepcopy
import json
from terms_validator import Terms, OrderPin, pin_order

ROOT=Path(__file__).resolve().parent
def write(name,value):
    path=ROOT/name;path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
def build():
    products=[]
    for name,amount in [('fixture-micro-1',1000000),('fixture-audit-89',89000000),('fixture-audit-99',99000000)]:
        products.append({'schema_version':'cwaas.synthetic_terms.v1','mode':'SYNTHETIC_ONLY',
          'product_id':name,'product_version':'v0.0.1','description':'TEST FIXTURE ONLY — no actual offer',
          'price':{'asset':'USDC','amount_atomic':amount,'network':'eip155:8453'},
          'approved_recipient':'0x1111111111111111111111111111111111111111',
          'delivery':{'artifact_or_service':'Synthetic UTF-8 test report',
            'acceptance_criteria':[{'criterion_id':'fixture-body-present','description':'Test report contains the agreed synthetic fixture marker.'}],
            'delivery_method':'Local test harness only','deadline':'2099-01-01T00:00:00Z'},
          'refund_and_failure_terms':'Synthetic fixture only; no payments or commercial promise.',
          'terms_approval_evidence':'SYNTHETIC_FIXTURE_NOT_HUMAN_APPROVAL','activation_authorization':'DISABLED'})
    catalog={'schema_version':'cwaas.synthetic_catalog.v1','approved_terms':products}
    write('fixtures/trusted_synthetic_catalog.json',catalog)
    schema=Terms.model_json_schema();schema['$schema']='https://json-schema.org/draft/2020-12/schema'
    schema['$id']='urn:cwaas:synthetic-terms:v1';write('terms.schema.json',schema)
    order_schema=OrderPin.model_json_schema();order_schema['$schema']=schema['$schema'];write('order_pin.schema.json',order_schema)
    cases=[]
    def case(name,obj,expect):
        file='fixtures/'+name+'.json';write(file,obj);cases.append({'name':name,'file':file,'expected':expect})
    for p in products:case('pass-'+p['product_id'],p,'PASS')
    base=products[1]
    edits=[('wrong-amount',['price','amount_atomic'],99000000),
      ('wrong-recipient',['approved_recipient'],'0x2222222222222222222222222222222222222222'),
      ('unapproved-version',['product_version'],'v0.0.2'),
      ('empty-acceptance',['delivery','acceptance_criteria'],[]),
      ('changed-scope',['delivery','artifact_or_service'],'Different service'),
      ('bool-is-not-amount',['price','amount_atomic'],True),
      ('fractional-atomic-amount',['price','amount_atomic'],89000000.5),
      ('amount-string',['price','amount_atomic'],'89000000'),
      ('zero-recipient',['approved_recipient'],'0x'+'0'*40),
      ('invalid-deadline',['delivery','deadline'],'2099-99-99T00:00:00Z'),
      ('timezone-missing',['delivery','deadline'],'2099-01-01T00:00:00'),
      ('activation-spoof',['activation_authorization'],'ENABLED'),
      ('empty-description',['description'],'   '),
      ('unsupported-network',['price','network'],'eip155:1'),
      ('micro-price-on-audit',['price','amount_atomic'],1000000)]
    for name,path,value in edits:
        obj=deepcopy(base);target=obj
        for key in path[:-1]:target=target[key]
        target[path[-1]]=value;case(name,obj,'FAIL')
    obj=deepcopy(products[2]);obj['price']['network']=None;case('99-network-unset',obj,'FAIL')
    obj=deepcopy(base);del obj['product_version'];case('unpinned-version',obj,'FAIL')
    obj=deepcopy(base);obj['facilitator_settled']=True;case('proof-flag-in-terms',obj,'FAIL')
    obj=deepcopy(base);obj['delivery']['acceptance_criteria']*=2;case('duplicate-criterion',obj,'FAIL')
    def nulls(obj,path=()):
        for key,value in obj.items():
            yield path+(key,)
            if isinstance(value,dict):yield from nulls(value,path+(key,))
    for path in nulls(base):
        obj=deepcopy(base);target=obj
        for key in path[:-1]:target=target[key]
        target[path[-1]]=None;case('null-'+'-'.join(path),obj,'FAIL')
    obj=deepcopy(base);obj['delivery']['acceptance_criteria'][0]['description']=None
    case('null-criterion-description',obj,'FAIL')
    write('fixtures/cases.json',cases)
    pin=pin_order('fixture-order-1',base,catalog).model_dump();write('fixtures/pass-order-pin.json',pin)
    bad=deepcopy(pin);bad['terms_sha256']='0'*64;write('fixtures/fail-order-stale-pin.json',bad)
    return cases
if __name__=='__main__':print(json.dumps({'fixture_cases':len(build())}))
