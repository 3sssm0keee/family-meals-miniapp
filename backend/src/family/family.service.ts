import { profile } from '../users/profile.js';
import { Injectable } from '@nestjs/common';
import type { TransactionClient } from '../database/prisma.service.js';
import type { RequestContext } from '../common/context.js';
import type { MemberRole } from '../../generated/prisma/enums.js';
import { audit,page,text } from '../common/business.js';
import { fail } from '../common/errors.js';
@Injectable()
export class FamilyService {
 async list(tx:TransactionClient,userId:string){const rows=await tx.familyMember.findMany({where:{userId,status:'ACTIVE',OR:[{accessExpiresAt:null},{accessExpiresAt:{gt:new Date()}}]},include:{family:true},orderBy:[{joinedAt:'desc'},{id:'desc'}]});return rows.map(m=>({id:m.familyId,name:m.family.name,memberId:m.id,role:m.role,accessExpiresAt:m.accessExpiresAt?.toISOString() ?? null}));}
 async create(tx:TransactionClient,userId:string,name:string){
  if(!await tx.familyMember.findFirst({where:{userId,role:'ADMIN',status:'ACTIVE'}}))fail(403,'FORBIDDEN');
  const f=await tx.family.create({data:{name:text(name)}});const m=await tx.familyMember.create({data:{familyId:f.id,userId,role:'ADMIN',status:'ACTIVE',joinedAt:new Date()}});return {id:f.id,name:f.name,memberId:m.id,role:m.role,accessExpiresAt:m.accessExpiresAt?.toISOString() ?? null};}
 async members(tx:TransactionClient,ctx:RequestContext,q:Record<string,unknown>){const p=page(q),where={familyId:ctx.familyId!,...(q.status?{status:q.status as 'ACTIVE'|'LEFT'|'REMOVED'}:{}),...(q.hideExpiredGuests?{OR:[{accessExpiresAt:null},{accessExpiresAt:{gt:new Date()}}]}:{})};const total=await tx.familyMember.count({where});const rows=await tx.familyMember.findMany({where,include:{user:true},orderBy:[{joinedAt:'desc'},{id:'desc'}],skip:p.skip,take:p.take});return {items:rows.map(m=>({id:m.id,displayName:m.user.displayName,avatar:profile(m.user).avatar,role:m.role,status:m.status,joinedAt:m.joinedAt.toISOString(),accessExpiresAt:m.accessExpiresAt?.toISOString() ?? null})),page:p.page,pageSize:p.pageSize,total};}
 async change(tx:TransactionClient,ctx:RequestContext,memberId:string,change:{role?:MemberRole;status?:'LEFT'|'REMOVED'}){
  const m=await tx.familyMember.findUnique({where:{familyId_id:{familyId:ctx.familyId!,id:memberId}}});if(!m)fail(404,'NOT_FOUND');
  if(m.status!=='ACTIVE')fail(403,'MEMBERSHIP_INACTIVE');
  if(m.role==='ADMIN'&&(change.status||change.role&&change.role!=='ADMIN')){const count=await tx.familyMember.count({where:{familyId:ctx.familyId,status:'ACTIVE',role:'ADMIN'}});if(count<=1)fail(409,'LAST_ADMIN');}
  const row=await tx.familyMember.update({where:{id:memberId},data:{...change,...(change.role ? {accessExpiresAt:change.role==='GUEST'?new Date(Date.now()+86400000):null}: {})},include:{user:true}});
  if(change.role)await audit(tx,ctx,'MEMBER_ROLE_UPDATE',memberId,undefined,`将成员「${row.user.displayName}」调整为${change.role==='ADMIN'?'管理员':change.role==='GUEST'?'访客':'正式成员'}`);else if(change.status==='REMOVED')await audit(tx,ctx,'MEMBER_REMOVE',memberId,undefined,`移出成员「${row.user.displayName}」`);
  return change.status?{ok:true as const}:{id:row.id,displayName:row.user.displayName,avatar:profile(row.user).avatar,role:row.role,status:row.status,joinedAt:row.joinedAt.toISOString(),accessExpiresAt:row.accessExpiresAt?.toISOString() ?? null};
 }
}
