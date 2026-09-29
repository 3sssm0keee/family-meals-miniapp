import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpException, type ArgumentsHost } from '@nestjs/common';
import { ApiExceptionFilter, DomainError } from '../src/common/errors.js';
import { contract,operations,validate,validateRequest } from '../src/common/contract.js';
import { normalized,checkVersion } from '../src/common/business.js';
import { inviteStatus } from '../src/invite/invite.service.js';
import { readFileSync } from 'node:fs';
test('HTTP exception filter preserves contract status/code and retry header',()=>{
 for(const [status,code] of Object.entries({400:'VALIDATION_ERROR',401:'UNAUTHENTICATED',403:'FORBIDDEN',404:'NOT_FOUND',413:'FILE_TOO_LARGE',415:'UNSUPPORTED_MEDIA_TYPE',429:'RATE_LIMITED',500:'INTERNAL_ERROR',503:'DEPENDENCY_UNAVAILABLE'})){
  let actualStatus=0;let body:any;const headers:Record<string,string>={};
  const response={status(s:number){actualStatus=s;return this;},json(v:unknown){body=v;},setHeader(k:string,v:string){headers[k]=v;}};
  new ApiExceptionFilter().catch(new HttpException('sensitive internal details',Number(status)),{switchToHttp:()=>({getRequest:()=>({requestId:'request-1'}),getResponse:()=>response})} as unknown as ArgumentsHost);
  assert.equal(actualStatus,Number(status));assert.equal(body.error.code,code);assert.equal(body.requestId,'request-1');assert.equal(JSON.stringify(body).includes('sensitive'),false);
  validate(contract.components.schemas.Error,body);if(status==='429')assert.match(headers['Retry-After'],/^\d+$/);
 }
});
test('request validator rejects privilege injection, invalid dates, false booleans and duplicates',()=>{
 assert.throws(()=>validate(contract.components.schemas.ProfileUpdate,{displayName:'name',role:'ADMIN'}),DomainError);
 assert.throws(()=>validate(contract.components.schemas.SessionEnsure,{serviceDate:'2026-02-30',mealType:'LUNCH'}),DomainError);
 assert.throws(()=>validate(contract.components.schemas.SubmitRequest,{variantIds:['a','a'],note:''}),DomainError);
 assert.throws(()=>validate(contract.components.schemas.ConfirmItem,{itemId:'a',decision:'CONFIRMED',plannedQuantity:0.15,reason:''}),DomainError);
 const req={headers:{},params:{familyId:'f'},query:{includeDeleted:'false',page:'2'},method:'GET',path:''};
 assert.equal(validateRequest(operations.get('listAdminDishes')!.spec,req).includeDeleted,false);
 assert.throws(()=>validateRequest(operations.get('listAdminDishes')!.spec,{...req,query:{includeDeleted:'yes'}}),DomainError);
});
test('name normalization, version conflict and exact invitation expiration',()=>{
 assert.equal(normalized('  ChICKEN '),'chicken');assert.throws(()=>normalized('  '),DomainError);
 assert.throws(()=>checkVersion(3,2),(e:unknown)=>e instanceof DomainError&&e.details.currentVersion===3);
 const expiresAt=new Date('2026-09-11T12:00:00Z');assert.equal(inviteStatus({expiresAt,revokedAt:null},expiresAt),'EXPIRED');
 assert.equal(inviteStatus({expiresAt,revokedAt:null},new Date(expiresAt.getTime()-1)),'ACTIVE');
});
test('all contract example requests and responses pass the runtime schema subset',()=>{
 const examples=JSON.parse(readFileSync(new URL('../../docs/contracts/examples-v1.json',import.meta.url),'utf8')).operations;
 for(const [id,example] of Object.entries(examples) as Array<[string,any]>){
  const op=operations.get(id)!.spec;
  validateRequest(op,{headers:Object.fromEntries(Object.entries(example.headers).map(([k,v])=>[k.toLowerCase(),v])) as Record<string,string>,params:example.pathParams,query:example.query,body:example.contentType==='multipart/form-data'?undefined:example.body,method:example.method,path:example.path});
  validate(op.responses[String(example.successStatus)].content['application/json'].schema,example.response);
 }
 assert.equal(Object.keys(examples).length,operations.size);
});
