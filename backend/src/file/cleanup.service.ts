import { Injectable } from '@nestjs/common';
import type { TransactionClient } from '../database/prisma.service.js';
import { PrismaService } from '../database/prisma.service.js';
import { AccessService } from '../common/access.service.js';
import type { RequestContext } from '../common/context.js';
import { audit, page } from '../common/business.js';
import { fail } from '../common/errors.js';
import { deleteAsset } from './storage.js';

@Injectable()
export class CleanupService {
  constructor(private readonly db:PrismaService, private readonly access:AccessService) {}

  private dto(task:{id:string;fileId:string;status:string;attemptCount:number;lastErrorCode:string|null;createdAt:Date;updatedAt:Date}) {
    return {taskId:task.id,fileId:task.fileId,status:task.status,attemptCount:task.attemptCount,
      lastErrorCode:task.lastErrorCode,createdAt:task.createdAt.toISOString(),updatedAt:task.updatedAt.toISOString()};
  }

  async candidates(tx:TransactionClient,ctx:RequestContext,q:Record<string,unknown>) {
    const p=page(q),where={familyId:ctx.familyId!,dish_imageFile:{none:{}}};
    const total=await tx.fileAsset.count({where});
    const files=await tx.fileAsset.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:p.skip,take:p.take});
    const tasks=await tx.fileCleanupTask.findMany({where:{familyId:ctx.familyId,fileId:{in:files.map(f=>f.id)}}});
    const taskByFile=new Map(tasks.map(t=>[t.fileId,t]));
    const items=await Promise.all(files.map(async f=>({fileId:f.id,sizeBytes:f.sizeBytes,createdAt:f.createdAt.toISOString(),
      taskId:taskByFile.get(f.id)?.id??null,taskStatus:taskByFile.get(f.id)?.status??null,
      canCleanup:!await tx.user.count({where:{avatarKey:f.storageKey}})})));
    return {items,page:p.page,pageSize:p.pageSize,total};
  }

  async task(tx:TransactionClient,ctx:RequestContext,id:string) {
    const task=await tx.fileCleanupTask.findUnique({where:{id}});
    if(!task||task.familyId!==ctx.familyId)fail(404,'NOT_FOUND');
    return this.dto(task);
  }

  async schedule(tx:TransactionClient,ctx:RequestContext,fileId:string) {
    const file=await tx.fileAsset.findUnique({where:{familyId_id:{familyId:ctx.familyId!,id:fileId}}});
    if(!file)fail(404,'NOT_FOUND');
    if(!/^[a-f0-9-]{36}$/.test(file.storageKey))fail(409,'VALIDATION_ERROR');
    if(await tx.dish.count({where:{familyId:ctx.familyId,imageFileId:fileId}})||
       await tx.user.count({where:{avatarKey:file.storageKey}}))fail(409,'VALIDATION_ERROR');
    const existing=await tx.fileCleanupTask.findUnique({where:{familyId_fileId:{familyId:ctx.familyId!,fileId}}});
    if(existing)return {taskId:existing.id};
    const actor=await tx.user.findUniqueOrThrow({where:{id:ctx.userId}});
    const task=await tx.fileCleanupTask.create({data:{familyId:ctx.familyId!,fileId,storageKey:file.storageKey,
      requestedByMemberId:ctx.memberId!,requestedByName:actor.displayName}});
    await audit(tx,ctx,'FILE_CLEANUP_REQUEST',fileId,undefined,'申请清理无引用图片');
    return {taskId:task.id};
  }

  async execute(familyId:string,taskId:string) {
    const claim=await this.db.transaction(async tx=>{
      await this.access.lockFamily(tx,familyId);
      const task=await tx.fileCleanupTask.findUnique({where:{id:taskId}});
      if(!task||task.familyId!==familyId||task.status==='COMPLETED')return null;
      if(task.status==='DELETING'&&task.leaseUntil&&task.leaseUntil>new Date())return null;
      const linked=await tx.dish.count({where:{familyId,imageFileId:task.fileId}})+
        await tx.user.count({where:{avatarKey:task.storageKey}});
      if(linked){await tx.fileCleanupTask.update({where:{id:taskId},data:{status:'SKIPPED',leaseUntil:null,lastErrorCode:'FILE_REFERENCED'}});return null;}
      if(task.status==='OBJECT_DELETED')return {storageKey:task.storageKey,deleteObject:false};
      await tx.fileCleanupTask.update({where:{id:taskId},data:{status:'DELETING',leaseUntil:new Date(Date.now()+60000),attemptCount:{increment:1},lastErrorCode:null}});
      return {storageKey:task.storageKey,deleteObject:true};
    });
    if(!claim)return;
    if(claim.deleteObject){
      try{await deleteAsset(claim.storageKey);}
      catch{
        await this.db.transaction(async tx=>{
          await this.access.lockFamily(tx,familyId);
          await tx.fileCleanupTask.updateMany({where:{id:taskId,status:'DELETING'},data:{status:'FAILED',leaseUntil:null,lastErrorCode:'STORAGE_DELETE_FAILED'}});
        });
        return;
      }
      const advanced=await this.db.transaction(async tx=>{
        await this.access.lockFamily(tx,familyId);
        // A late storage result must never move a completed task backward.
        return tx.fileCleanupTask.updateMany({where:{id:taskId,status:{in:['DELETING','FAILED']}},data:{status:'OBJECT_DELETED',leaseUntil:null,lastErrorCode:null}});
      });
      if(advanced.count===0)return;
    }
    await this.db.transaction(async tx=>{
      await this.access.lockFamily(tx,familyId);
      const task=await tx.fileCleanupTask.findUniqueOrThrow({where:{id:taskId}});
      if(task.status==='COMPLETED')return;
      if(task.status!=='OBJECT_DELETED')return;
      const linked=await tx.dish.count({where:{familyId,imageFileId:task.fileId}})+
        await tx.user.count({where:{avatarKey:task.storageKey}});
      if(linked){await tx.fileCleanupTask.update({where:{id:taskId},data:{status:'FAILED',lastErrorCode:'REFERENCE_AFTER_DELETE'}});return;}
      await tx.fileAsset.deleteMany({where:{familyId,id:task.fileId,storageKey:task.storageKey}});
      await tx.fileCleanupTask.update({where:{id:taskId},data:{status:'COMPLETED',lastErrorCode:null}});
      await tx.menuOperation.create({data:{familyId,actorMemberId:task.requestedByMemberId,
        actorName:task.requestedByName,action:'FILE_CLEANUP_COMPLETE',resourceId:task.fileId,reason:'',summary:'清理无引用图片完成'}});
    });
  }
}
