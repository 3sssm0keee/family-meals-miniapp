"""Generate TS/examples and validate the schema subset actually used, offline.

This is deliberately not a replacement for a full OpenAPI conformance validator.
"""
import copy
import hashlib
import json
import re
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent
api = json.loads((ROOT/'openapi-v1.json').read_text(encoding='utf-8'))
schemas = api['components']['schemas']
def resolve(s):
    if '$ref' in s:
        assert s['$ref'].startswith('#/components/schemas/')
        return resolve(schemas[s['$ref'].split('/')[-1]])
    return s

def validate(value, s, path='$'):
    s=resolve(s)
    for union in ('anyOf','oneOf'):
        if union in s:
            matches=0
            for branch in s[union]:
                try: validate(value,branch,path); matches+=1
                except (AssertionError,ValueError): pass
            assert (matches==1 if union=='oneOf' else matches>=1), (path,union,matches)
            return
    t=s.get('type')
    valid={'object':isinstance(value,dict),'array':isinstance(value,list),'string':isinstance(value,str),'integer':type(value) is int,'number':type(value) in (int,float),'boolean':type(value) is bool,'null':value is None}
    assert valid.get(t,True),(path,'type',t,value)
    if 'const' in s: assert value==s['const'],(path,'const')
    if 'enum' in s: assert value in s['enum'],(path,'enum')
    if t=='object':
        assert set(s.get('required',[]))<=value.keys(),(path,'required')
        assert len(value)>=s.get('minProperties',0),(path,'minProperties')
        if s.get('additionalProperties') is False: assert value.keys()<=s['properties'].keys(),(path,'extra properties')
        for k,v in value.items():
            if k in s.get('properties',{}): validate(v,s['properties'][k],path+'.'+k)
    if t=='array':
        assert s.get('minItems',0)<=len(value)<=s.get('maxItems',10**9),(path,'array length')
        if s.get('uniqueItems'): assert len({json.dumps(x,sort_keys=True) for x in value})==len(value),(path,'uniqueItems')
        for i,v in enumerate(value): validate(v,s['items'],f'{path}[{i}]')
    if t=='string':
        assert s.get('minLength',0)<=len(value)<=s.get('maxLength',10**9),(path,'string length')
        if 'pattern' in s: assert re.search(s['pattern'],value),(path,'pattern')
        if s.get('format')=='date': date.fromisoformat(value)
        if s.get('format')=='date-time': datetime.fromisoformat(value.replace('Z','+00:00'))
        if s.get('format')=='uri': assert re.match(r'^https?://[^/]+',value),(path,'uri')
    if t in ('integer','number'):
        assert s.get('minimum',float('-inf'))<=value<=s.get('maximum',float('inf')),(path,'range')
        if 'multipleOf' in s: assert Decimal(str(value))%Decimal(str(s['multipleOf']))==0,(path,'multipleOf')

def sample(s, field=''):
    s=resolve(s)
    if 'const' in s:return s['const']
    if 'enum' in s:return s['enum'][0]
    for union in ('anyOf','oneOf'):
        if union in s:return sample(s[union][0],field)
    t=s['type']
    if t=='object':return {k:sample(v,k) for k,v in s['properties'].items()}
    if t=='array':return [sample(s['items'],field) for _ in range(s.get('minItems',0))]
    if t=='null':return None
    if t=='boolean':return True
    if t in ('integer','number'):return s.get('minimum',0)
    if s.get('format')=='date':return '2026-09-11'
    if s.get('format')=='date-time':return '2026-09-11T04:00:00.000Z'
    if s.get('format')=='uri':return 'https://example.invalid/signed-image'
    if s.get('format')=='binary':return '<binary image bytes: multipart file>'
    if 'pattern' in s or field.lower().endswith('id'):return 'example_'+'a'*max(8,s.get('minLength',1)-8)
    values={'name':'红烧肉','displayName':'张三','portionDescription':'一份约供两人分享','note':'少盐','description':'示例说明','reason':'当天食材不足','message':'示例错误信息'}
    return values.get(field,'a'*max(1,s.get('minLength',1)))

def ts(s):
    if '$ref' in s:return s['$ref'].split('/')[-1]
    if 'const' in s:return json.dumps(s['const'],ensure_ascii=False)
    if 'enum' in s:return ' | '.join(json.dumps(x,ensure_ascii=False) for x in s['enum'])
    for union in ('anyOf','oneOf'):
        if union in s:return '('+' | '.join(ts(x) for x in s[union])+')'
    t=s.get('type')
    if t=='object':return '{ '+ '; '.join(json.dumps(k)+('' if k in s.get('required',[]) else '?')+': '+ts(v) for k,v in s.get('properties',{}).items())+' }'
    if t=='array':return 'Array<'+ts(s['items'])+'>'
    return {'integer':'number','number':'number','boolean':'boolean','string':'string','null':'null'}.get(t,'unknown')

def walk(s):
    if isinstance(s,dict):
        if '$ref' in s:resolve(s)
        if s.get('type')=='object':
            assert set(s.get('required',[]))<=s.get('properties',{}).keys()
        for v in s.values():walk(v)
    elif isinstance(s,list):
        for v in s:walk(v)

walk(api)
lines=['// Generated by check_contract.py from openapi-v1.json. Do not edit.', '// Types alone do not validate ranges or enforce permissions; consult the contract.']
for n,s in schemas.items():lines.append(f'export type {n} = {ts(s)};')
lines.append('export interface Operations {')
examples={}
seen=set()
assert api['openapi']=='3.1.0'
for path,methods in api['paths'].items():
    for method,op in methods.items():
        oid=op['operationId']; assert oid not in seen; seen.add(oid)
        params=op.get('parameters',[])
        assert set(re.findall(r'{(\w+)}',path))=={p['name'] for p in params if p['in']=='path'}
        assert len({(p['in'],p['name']) for p in params})==len(params)
        assert all(p['required'] for p in params if p['in']=='path')
        assert op['x-required-role'] in ('PUBLIC','AUTHENTICATED','MEMBER','ADMIN')
        if '/admin/' in path:assert op['x-required-role']=='ADMIN'
        if method!='get' and oid!='login':assert any(p['name']=='Idempotency-Key' and p['required'] for p in params)
        ex={'method':method.upper(),'path':path,'pathParams':{},'query':{},'headers':{},'successStatus':next(int(c) for c in op['responses'] if c.startswith('2'))}
        if op['x-required-role']!='PUBLIC':ex['headers']['Authorization']='Bearer <real-token-at-runtime>'
        for p in params:ex[{'path':'pathParams','query':'query','header':'headers'}[p['in']]][p['name']]=sample(p['schema'],p['name'])
        body=op.get('requestBody',{}).get('content',{})
        if body:
            content_type=next(iter(body));ex['contentType']=content_type
            ex['body']=sample(body[content_type]['schema'])
        response_schema=op['responses'][str(ex['successStatus'])]['content']['application/json']['schema']
        ex['response']=sample(response_schema)
        examples[oid]=ex
        request_parts=[]
        for loc,label in [('path','path'),('query','query'),('header','headers')]:
            pp={p['name']:p['schema'] for p in params if p['in']==loc}
            if pp:request_parts.append(label+': '+ts({'type':'object','properties':pp,'required':[p['name'] for p in params if p['in']==loc and p.get('required')]}))
        if body:request_parts.append('body: '+ts(body[next(iter(body))]['schema']))
        lines.append(json.dumps(oid)+': { request: { '+'; '.join(request_parts)+' }; response: '+ts(response_schema)+' };')
lines.append('}')

# Meaningful full review example, shared across the review write/read endpoints.
session={'id':'meal_1','serviceDate':'2026-09-11','mealType':'LUNCH','timezone':'Asia/Shanghai','serverTime':'2026-09-11T04:00:00.000Z','canSubmit':False,'submitBlockedReason':'ALREADY_SUBMITTED','reviewVersion':7}
def participant(i):return {'memberId':f'm{i}','displayName':{1:'张三',2:'李四',3:'王五',4:'赵六'}[i],'note':''}
def rv(i,name,people,decision,quantity,demand,reviewed):return {'itemId':f'item_{i}','variantId':f'variant_{i}','name':name,'portionDescription':'一份约供两人分享','participantCount':len(people),'decision':decision,'needsReview':True,'plannedQuantity':quantity,'unit':'PORTION','reason':'','participants':[participant(x) for x in people],'lastReviewedParticipantCount':2 if reviewed else 0,'demandVersion':demand,'reviewedDemandVersion':reviewed}
review={'session':session,'dishes':[{'dishId':'dish_1','name':'红烧肉','kind':'PERMANENT','uniqueParticipantCount':4,'variants':[rv(1,'普通版',[1,2,3],'CONFIRMED',1.5,3,2),rv(2,'少油版',[2,4],'UNREVIEWED',None,1,0)]}]}
examples['getReview']['response']={'data':review,'requestId':'req_example'}
review['hasTemporaryAdditions']=True
public=copy.deepcopy(review)
public.pop('hasTemporaryAdditions',None)
for dish in public['dishes']:
    for v in dish['variants']:
        for k in ['participants','lastReviewedParticipantCount','demandVersion','reviewedDemandVersion']:del v[k]
examples['getFamilyMenu']['response']={'data':public,'requestId':'req_example'}
examples['reviewMenu']['body']={'expectedReviewVersion':7,'items':[{'itemId':'item_1','decision':'CONFIRMED','plannedQuantity':1.5,'reason':''},{'itemId':'item_2','decision':'CONFIRMED','plannedQuantity':1,'reason':''}]}
after=copy.deepcopy(review);after['session']['reviewVersion']=8
after['hasTemporaryAdditions']=False
for v in after['dishes'][0]['variants']:
    v.update(decision='CONFIRMED',needsReview=False,reviewedDemandVersion=v['demandVersion'],lastReviewedParticipantCount=v['participantCount'])
    if v['itemId']=='item_2':v['plannedQuantity']=1
examples['reviewMenu']['response']={'data':{'batchId':'batch_1','review':after,'notificationRecordCount':4},'requestId':'req_review'}
for oid in ['getSession','ensureSession']:
    examples[oid]['response']['data']={**session,'canSubmit':True,'submitBlockedReason':None}
examples['getPersonalMenu']['response']['data']=None
examples['getNotificationConfig']['response']['data']={'enabled':False,'templateId':None}
examples['createInvite']['response']['data'].update(createdAt='2026-09-11T04:00:00.000Z',expiresAt='2026-09-12T04:00:00.000Z')
examples['login']['response']['data']['expiresAt']='2026-09-11T06:00:00.000Z'
examples['submitMenu']['body']={'variantIds':['variant_1'],'note':'少盐'}
# Generic examples show shape; this override provides a coherent submission snapshot.
examples['submitMenu']['response']['data']={'id':'pm_1','sessionId':'meal_1','submittedAt':'2026-09-11T04:00:00.000Z','note':'少盐','version':1,'items':[{'dishId':'dish_1','variantId':'variant_1','dishName':'红烧肉','variantName':'普通版','portionDescription':'一份约供两人分享','decision':'UNREVIEWED','needsReview':True,'plannedQuantity':None,'unit':'PORTION','reason':''}]}
examples['updateNote']['body']={'note':'少盐、不加葱','expectedVersion':1}
examples['updateNote']['response']['data']=copy.deepcopy(examples['submitMenu']['response']['data'])
examples['updateNote']['response']['data'].update(note='少盐、不加葱',version=2)
variant={'id':'variant_1','name':'普通版','portionDescription':'一份约供两人分享','description':'家常口味','isAvailable':True,'version':1,'deletedAt':None}
dish={'id':'dish_1','name':'红烧肉','description':'家常菜','image':None,'isAvailable':True,'kind':'PERMANENT','originSessionId':None,'version':1,'deletedAt':None,'variants':[variant]}
for oid in ['getDish','getAdminDish','createDish','updateDish','createTemporaryDish','promoteDish']:
    examples[oid]['response']['data']=copy.deepcopy(dish)
for oid in ['createDish','createTemporaryDish']:
    examples[oid]['body'].update(imageFileId=None,name='红烧肉')
    examples[oid]['body']['variants']=[{k:variant[k] for k in ['name','portionDescription','description','isAvailable']}]
examples['createTemporaryDish']['response']['data'].update(kind='TEMPORARY',originSessionId='meal_1')
examples['promoteDish']['response']['data'].update(originSessionId='meal_1',version=2)
examples['updateDish']['response']['data']['version']=2
for oid in ['createVariant','updateVariant']:
    examples[oid]['response']['data']=copy.deepcopy(variant)
examples['updateVariant']['response']['data']['version']=2
for oid in ['uploadFile','getFile']:
    examples[oid]['response']['data'].update(expiresAt='2026-09-11T04:15:00.000Z',sizeBytes=1024)

validations=0
for path,methods in api['paths'].items():
    for method,op in methods.items():
        ex=examples[op['operationId']]
        for p in op['parameters']:
            validate(ex[{'path':'pathParams','query':'query','header':'headers'}[p['in']]][p['name']],p['schema']);validations+=1
        if 'body' in ex:
            validate(ex['body'],op['requestBody']['content'][ex['contentType']]['schema']);validations+=1
        validate(ex['response'],op['responses'][str(ex['successStatus'])]['content']['application/json']['schema']);validations+=1

# Deliberate invalid requests must be rejected by schema validation.
negative=[('ConfirmItem',{'itemId':'x','decision':'CONFIRMED','plannedQuantity':0,'reason':''}),('ConfirmItem',{'itemId':'x','decision':'CONFIRMED','plannedQuantity':1.55,'reason':''}),('CancelItem',{'itemId':'x','decision':'CANCELLED','plannedQuantity':1,'reason':'缺货'}),('CancelItem',{'itemId':'x','decision':'CANCELLED','plannedQuantity':None,'reason':''}),('SubmitRequest',{'variantIds':['x','x'],'note':''}),('SubmitRequest',{'variantIds':[],'note':''}),('DishUpdate',{'expectedVersion':1}),('RoleUpdate',{'role':'OWNER'}),('NoteUpdate',{'note':'','expectedVersion':0}),('SubmitRequest',{'variantIds':['x'],'note':'','familyId':'other'})]
for n,value in negative:
    try:validate(value,schemas[n])
    except (AssertionError,ValueError):pass
    else:raise AssertionError(('negative accepted',n,value))
# Counts are checked independently from DTO construction.
for dish in review['dishes']:
    people=set()
    for v in dish['variants']:
        ids={p['memberId'] for p in v['participants']}
        assert len(ids)==v['participantCount'];people|=ids
    assert len(people)==dish['uniqueParticipantCount']==4
assert not any('participants' in v for d in public['dishes'] for v in d['variants'])

(ROOT/'frontend-types.ts').write_text('\n'.join(lines)+'\n',encoding='utf-8')
(ROOT/'examples-v1.json').write_text(json.dumps({'notice':'Synthetic schema examples; not server responses or a complete connected dataset. Review example demonstrates 3/2/4 counting. Binary upload body is a placeholder.','operations':examples},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'openapi-v1.json',ROOT/'frontend-types.ts',ROOT/'examples-v1.json']}
report={'status':'PASS','scope':'Offline checks for the JSON Schema subset used here; not full OpenAPI certification or runtime tests.','operations':len(seen),'schemas':len(schemas),'positiveParameterBodyResponseChecks':validations,'negativeSchemaChecks':len(negative),'referenceAndPathChecks':'PASS','reviewExampleDeduplicatedCounts':[3,2,4],'publicViewPrivacyCheck':'PASS','sha256':hashes,'notRun':['Full third-party OpenAPI validator (outside this checker)','TypeScript compilation (see integration acceptance report)','Backend/database integration (see integration acceptance report)','WeChat rendering and real notification delivery (outside this checker)']}
(ROOT/'validation-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
