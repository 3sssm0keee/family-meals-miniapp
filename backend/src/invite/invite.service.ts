import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { TransactionClient } from '../database/prisma.service.js';
import type { RequestContext } from '../common/context.js';
import type { Invite } from '../../generated/prisma/client.js';
import { AccessService } from '../common/access.service.js';
import { hash } from '../common/idempotency.service.js';
import { audit,page } from '../common/business.js';
import { fail } from '../common/errors.js';
export function inviteStatus(invite:Pick<Invite,'revokedAt'|'expiresAt'>,now=new Date()) {return invite.revokedAt?'REVOKED' as const:now>=invite.expiresAt?'EXPIRED' as const:'ACTIVE' as const;}
@Injectable()
export class InviteService {
 constructor(private readonly access:AccessService){}
 dto(i:Invite,count:number){return {id:i.id,role:i.role,createdAt:i.createdAt.toISOString(),expiresAt:i.expiresAt.toISOString(),status:inviteStatus(i),redemptionCount:count};}
 async create(tx:TransactionClient,ctx:RequestContext,role:'MEMBER'|'GUEST'){
  const code=randomBytes(32).toString('base64url'),now=new Date();
  const i=await tx.invite.create({data:{familyId:ctx.familyId!,creatorMemberId:ctx.memberId!,role,codeHash:hash(code),createdAt:now,expiresAt:new Date(now.getTime()+86400000)}});
  await audit(tx,ctx,'INVITE_CREATE',i.id,undefined,`创建${role==='GUEST'?'访客':'正式成员'}邀请`);return {...this.dto(i,0),code};
 }
 async list(tx:TransactionClient,ctx:RequestContext,q:Record<string,unknown>){const p=page(q),where={familyId:ctx.familyId!};const total=await tx.invite.count({where});const rows=await tx.invite.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:p.skip,take:p.take});const items=await Promise.all(rows.map(async i=>this.dto(i,await tx.inviteRedemption.count({where:{familyId:i.familyId,inviteId:i.id}}))));return {items,page:p.page,pageSize:p.pageSize,total};}
 async revoke(tx:TransactionClient,ctx:RequestContext,id:string){const i=await tx.invite.findUnique({where:{familyId_id:{familyId:ctx.familyId!,id}}});if(!i)fail(404,'NOT_FOUND');if(!i.revokedAt){await tx.invite.update({where:{id},data:{revokedAt:new Date()}});await audit(tx,ctx,'INVITE_REVOKE',id,undefined,`撤销${i.role==='GUEST'?'访客':'正式成员'}邀请`);}return {ok:true as const};}
 async redeem(tx:TransactionClient,ctx:RequestContext,code:string){
  const adminCode=process.env.REGISTRATION_ADMIN_CODE;
  if(adminCode && adminCode.length>=32 && code===adminCode)return this.registerMember(tx,ctx,'ADMIN');
  if(code==='REPLACE_GUEST_CODE')return this.registerMember(tx,ctx,'GUEST');
  const first=await tx.invite.findUnique({where:{codeHash:hash(code)}});if(!first)fail(404,'NOT_FOUND');
  await this.access.lockFamily(tx,first.familyId);
  const i=await tx.invite.findUniqueOrThrow({where:{id:first.id}});
  const old=await tx.inviteRedemption.findUnique({where:{inviteId_userId:{inviteId:i.id,userId:ctx.userId}}});
  let member=await tx.familyMember.findUnique({where:{familyId_userId:{familyId:i.familyId,userId:ctx.userId}}});
  const alreadyJoined=member?.status==='ACTIVE';
  const promote=alreadyJoined && member!.role==='GUEST' && i.role==='MEMBER';
  if(promote){
   const state=inviteStatus(i);if(state==='REVOKED')fail(410,'INVITE_REVOKED');if(state==='EXPIRED')fail(410,'INVITE_EXPIRED');
   member=await tx.familyMember.update({where:{id:member!.id},data:{role:'MEMBER',accessExpiresAt:null}});
   const user=await tx.user.findUniqueOrThrow({where:{id:ctx.userId}});
   await audit(tx,{...ctx,familyId:i.familyId,memberId:member.id,role:member.role},'MEMBER_ROLE_UPDATE',member.id,undefined,`「${user.displayName}」由访客转为正式成员`);
  } else if(member?.accessExpiresAt && member.accessExpiresAt<=new Date()) {
   if(old || member.status!=='ACTIVE')fail(403,'MEMBERSHIP_INACTIVE');
   const state=inviteStatus(i);if(state==='REVOKED')fail(410,'INVITE_REVOKED');if(state==='EXPIRED')fail(410,'INVITE_EXPIRED');
   member=await tx.familyMember.update({where:{id:member.id},data:{accessExpiresAt:new Date(Date.now()+86400000)}});
  }
  if(old){if(!alreadyJoined)fail(409,'INVITE_ALREADY_USED');}
  else {
   const state=inviteStatus(i);if(state==='REVOKED')fail(410,'INVITE_REVOKED');if(state==='EXPIRED')fail(410,'INVITE_EXPIRED');
   if(!alreadyJoined){
    member=await tx.familyMember.upsert({where:{familyId_userId:{familyId:i.familyId,userId:ctx.userId}},create:{familyId:i.familyId,userId:ctx.userId,role:i.role,status:'ACTIVE',joinedAt:new Date(),accessExpiresAt:i.role==='GUEST'?new Date(Date.now()+86400000):null},update:{role:i.role,status:'ACTIVE',joinedAt:new Date(),accessExpiresAt:i.role==='GUEST'?new Date(Date.now()+86400000):null}});
    const user=await tx.user.findUniqueOrThrow({where:{id:ctx.userId}});
    await audit(tx,{...ctx,familyId:i.familyId,memberId:member.id,role:member.role},'MEMBER_JOIN',member.id,undefined,`「${user.displayName}」以${i.role==='GUEST'?'访客':'正式成员'}身份加入家庭`);
   }
   await tx.inviteRedemption.create({data:{familyId:i.familyId,inviteId:i.id,userId:ctx.userId,memberId:member!.id,redeemedAt:new Date()}});
  }
  const family=await tx.family.findUniqueOrThrow({where:{id:i.familyId}});
  return {family:{id:family.id,name:family.name,memberId:member!.id,role:member!.role,accessExpiresAt:member!.accessExpiresAt?.toISOString() ?? null},alreadyJoined};
 }
 async registerMember(tx:TransactionClient,ctx:RequestContext,role:'GUEST'|'ADMIN'='GUEST'){
  const familyId=process.env.REGISTRATION_FAMILY_ID;
  if(!familyId)fail(503,'DEPENDENCY_UNAVAILABLE');
  await this.access.lockFamily(tx,familyId);
  const existing=await tx.familyMember.findUnique({where:{familyId_userId:{familyId,userId:ctx.userId}}});
  // A removed member cannot undo an administrator's decision using the shared code.
  if(existing && existing.status!=='ACTIVE')fail(403,'MEMBERSHIP_INACTIVE');
  if(existing?.accessExpiresAt && existing.accessExpiresAt<=new Date() && role!=='ADMIN')fail(403,'MEMBERSHIP_INACTIVE');
  let member=existing ?? await tx.familyMember.create({data:{familyId,userId:ctx.userId,role,status:'ACTIVE',joinedAt:new Date(),accessExpiresAt:role==='GUEST'?new Date(Date.now()+86400000):null}});
  if(!existing){
   const user=await tx.user.findUniqueOrThrow({where:{id:ctx.userId}});
   await audit(tx,{...ctx,familyId,memberId:member.id,role:member.role},'MEMBER_JOIN',member.id,undefined,`「${user.displayName}」以${role==='GUEST'?'访客':'管理员'}身份加入家庭`);
  }
  if(existing && role==='ADMIN' && existing.role!=='ADMIN') {
   member=await tx.familyMember.update({where:{id:existing.id},data:{role:'ADMIN',accessExpiresAt:null}});
   const user=await tx.user.findUniqueOrThrow({where:{id:ctx.userId}});
   await audit(tx,{...ctx,familyId,memberId:member.id,role:'ADMIN'},'MEMBER_ROLE_UPDATE',member.id,undefined,`将「${user.displayName}」调整为管理员`);
  }
  const family=await tx.family.findUniqueOrThrow({where:{id:familyId}});
  return {family:{id:family.id,name:family.name,memberId:member.id,role:member.role,accessExpiresAt:member.accessExpiresAt?.toISOString() ?? null},alreadyJoined:!!existing};
 }
}
