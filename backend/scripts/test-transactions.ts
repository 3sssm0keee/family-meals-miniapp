import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AccessService } from '../src/common/access.service.js';
import { FamilyService } from '../src/family/family.service.js';
import { IdempotencyService } from '../src/common/idempotency.service.js';
import { DomainError } from '../src/common/errors.js';
import type { PrismaService,TransactionClient } from '../src/database/prisma.service.js';
const ctx={userId:'user',familyId:'family',requestId:'request'};
test('family write locks before checking current role; inactive and downgraded users fail',async()=>{
 const calls:string[]=[];
 const tx={$queryRaw:async()=>{calls.push('lock');return [{id:'family'}];},familyMember:{findUnique:async()=>{calls.push('member');return {id:'member',role:'MEMBER',status:'ACTIVE'};}}} as unknown as TransactionClient;
 await assert.rejects(()=>new AccessService().requireMember(tx,ctx,true,true),(e:unknown)=>e instanceof DomainError&&e.code==='FORBIDDEN');assert.deepEqual(calls,['lock','member']);
 (tx.familyMember.findUnique as any)=async()=>({id:'member',role:'ADMIN',status:'LEFT'});
 await assert.rejects(()=>new AccessService().requireMember(tx,ctx,false,true),(e:unknown)=>e instanceof DomainError&&e.code==='MEMBERSHIP_INACTIVE');
});
test('last admin cannot leave, be removed, or be downgraded',async()=>{
 const tx={familyMember:{findUnique:async()=>({id:'member',role:'ADMIN',status:'ACTIVE'}),count:async()=>1,update:async()=>{throw new Error('must not write');}}} as unknown as TransactionClient;
 for(const change of [{status:'LEFT' as const},{status:'REMOVED' as const},{role:'MEMBER' as const}])await assert.rejects(()=>new FamilyService().change(tx,ctx,'member',change),(e:unknown)=>e instanceof DomainError&&e.code==='LAST_ADMIN');
});
test('idempotency replay reauthorizes and conflicts do not run business writes',async()=>{
 process.env.IDEMPOTENCY_ENCRYPTION_KEY=Buffer.alloc(32,9).toString('base64');
 let row:any=null,writes=0,authCalls=0;const records={findUnique:async()=>row,create:async({data}:any)=>row={...data,id:'record'},update:async({data}:any)=>row={...row,...data},deleteMany:async()=>{row=null;return {count:1};}};
 const db={idempotencyRecord:records,transaction:async(fn:any)=>fn({idempotencyRecord:records})} as unknown as PrismaService;
 const service=new IdempotencyService(db),request={key:'request_123456789',method:'POST',path:'/api/v1/families/family/test',body:{v:1}};
 const auth=async()=>{authCalls++;};const work=async()=>{writes++;return {status:201,data:{code:'private'}};};
 const first=await service.execute(ctx,request,auth,work);const replay=await service.execute(ctx,request,auth,work);assert.deepEqual(replay,first);assert.equal(writes,1);assert.equal(authCalls,3);
 await assert.rejects(()=>service.execute(ctx,{...request,body:{v:2}},auth,work),(e:unknown)=>e instanceof DomainError&&e.code==='IDEMPOTENCY_CONFLICT');
 await assert.rejects(()=>service.execute(ctx,request,async()=>{throw new DomainError(403,'FORBIDDEN');},work),(e:unknown)=>e instanceof DomainError&&e.code==='FORBIDDEN');assert.equal(writes,1);
 row.status='PROCESSING';await assert.rejects(()=>service.execute(ctx,request,auth,work),(e:unknown)=>e instanceof DomainError&&e.code==='REQUEST_IN_PROGRESS');
});
