import assert from 'node:assert/strict';
import {test} from 'node:test';
import {InviteService} from '../src/invite/invite.service.js';
import {FamilyService} from '../src/family/family.service.js';
import {AccessService} from '../src/common/access.service.js';
import type {TransactionClient} from '../src/database/prisma.service.js';
const ctx={userId:'u',requestId:'r'};
test('fixed registration requires configured family, creates 24-hour GUEST, preserves ADMIN, rejects removed members',async()=>{
 const old=process.env.REGISTRATION_FAMILY_ID;
 let member:any=null,created=0;
 const tx={$queryRaw:async()=>[{id:'f'}],family:{findUniqueOrThrow:async()=>({id:'f',name:'Kitchen'})},familyMember:{findUnique:async()=>member,create:async({data}:any)=>{created++;member={id:'m',...data};return member;}}} as unknown as TransactionClient;
 const service=new InviteService(new AccessService());
 try {
  delete process.env.REGISTRATION_FAMILY_ID;
  await assert.rejects(()=>service.redeem(tx,ctx,'REPLACE_GUEST_CODE'),{code:'DEPENDENCY_UNAVAILABLE'});
  process.env.REGISTRATION_FAMILY_ID='f';
  const result=await service.redeem(tx,ctx,'REPLACE_GUEST_CODE');assert.equal(result.family.role,'GUEST');assert.equal(created,1);
  assert.equal((await service.redeem(tx,ctx,'REPLACE_GUEST_CODE')).alreadyJoined,true);assert.equal(created,1);
  member.role='ADMIN';assert.equal((await service.redeem(tx,ctx,'REPLACE_GUEST_CODE')).family.role,'ADMIN');
  member.status='REMOVED';await assert.rejects(()=>service.redeem(tx,ctx,'REPLACE_GUEST_CODE'),{code:'MEMBERSHIP_INACTIVE'});
 } finally {if(old===undefined)delete process.env.REGISTRATION_FAMILY_ID;else process.env.REGISTRATION_FAMILY_ID=old;}
});
test('unknown code cannot register; no identity cannot create an administrator family',async()=>{
 const tx={invite:{findUnique:async()=>null},familyMember:{findFirst:async()=>null}} as unknown as TransactionClient;
 await assert.rejects(()=>new InviteService(new AccessService()).redeem(tx,ctx,'000000'),{code:'NOT_FOUND'});
 await assert.rejects(()=>new FamilyService().create(tx,'u','Kitchen'),{code:'FORBIDDEN'});
});
test('MEMBER and GUEST cannot enter admin API, and inactive identity cannot read family data',async()=>{
 for(const role of ['MEMBER','GUEST']){
  const tx={familyMember:{findUnique:async()=>({id:'m',status:'ACTIVE',role})}} as unknown as TransactionClient;
  await assert.rejects(()=>new AccessService().requireMember(tx,{...ctx,familyId:'f'},true),{code:'FORBIDDEN'});
 }
 const tx={familyMember:{findUnique:async()=>null}} as unknown as TransactionClient;
 await assert.rejects(()=>new AccessService().requireMember(tx,{...ctx,familyId:'f'}),{code:'MEMBERSHIP_INACTIVE'});
});
