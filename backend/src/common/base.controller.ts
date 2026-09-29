import { Controller, Get, Post, Patch, Delete, Req, Res, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { ApiRuntime } from './api-runtime.service.js';
import { AuthService } from '../auth/auth.service.js';
import { UsersService } from '../users/users.service.js';
import { FamilyService } from '../family/family.service.js';
import { InviteService } from '../invite/invite.service.js';
import { DishService } from '../dish/dish.service.js';
import { FileService } from '../file/file.service.js';
import { CleanupService } from '../file/cleanup.service.js';
import { operations, validateRequest, type ApiRequest } from './contract.js';
import { fail } from './errors.js';
import type * as DTO from '../../../docs/contracts/frontend-types.js';
export interface ApiResponse {status(s:number):ApiResponse;json(v:unknown):unknown}
export const baseOperations=['createFileUpload','completeFileUpload','uploadAvatar','login','getMe','updateMe','listMyFamilies','createFamily','listDishes','getDish','listAdminDishes','getDishDeletionPreview','createDish','getAdminDish','updateDish','deleteDish','createVariant','updateVariant','deleteVariant','promoteDish','uploadFile','getFile','listFileCleanupCandidates','getFileCleanupTask','requestFileCleanup','createInvite','listInvites','revokeInvite','redeemInvite','listFamilyMembers','listMembers','updateMemberRole','removeMember','leaveFamily'] as const;
@Controller()
export class BaseController {
 private readonly loginAttempts=new Map<string,{count:number;until:number}>();
 constructor(private readonly runtime:ApiRuntime,private readonly auth:AuthService,private readonly users:UsersService,private readonly family:FamilyService,private readonly invites:InviteService,private readonly dishes:DishService,private readonly files:FileService,private readonly cleanup:CleanupService){}
 async handle(id:typeof baseOperations[number],req:ApiRequest & {ip?:string},res:ApiResponse){
  if(id==='login'){
   req.requestId=randomUUID();validateRequest(operations.get(id)!.spec,req);
   const now=Date.now();for(const [key,v] of this.loginAttempts)if(v.until<=now)this.loginAttempts.delete(key);
   const key=req.ip??'unknown',entry=this.loginAttempts.get(key)??{count:0,until:now+60000};entry.count++;this.loginAttempts.set(key,entry);if(entry.count>30)fail(429,'RATE_LIMITED');
   return res.status(200).json({data:await this.auth.login((req.body as DTO.LoginRequest).code),requestId:req.requestId});
  }
  try{
   const result=await this.runtime.run<unknown>(id,req,async(tx,ctx,q)=>{
    const b=req.body,p=req.params;
    switch(id){
     case 'createFileUpload':return this.files.initiate(ctx,(b as {sizeBytes:number}).sizeBytes);
     case 'completeFileUpload':return this.files.complete(tx,ctx,(b as {ticket:string}).ticket);
     case 'uploadAvatar':if(!req.file)fail(400,'VALIDATION_ERROR');return this.users.avatar(tx,ctx.userId,req.file.buffer);
     case 'getMe':return this.users.get(tx,ctx.userId);
     case 'updateMe':return this.users.update(tx,ctx.userId,(b as DTO.ProfileUpdate).displayName);
     case 'listMyFamilies':return this.family.list(tx,ctx.userId);
     case 'createFamily':return this.family.create(tx,ctx.userId,(b as DTO.FamilyCreate).name);
     case 'listFamilyMembers':return this.family.members(tx,ctx,{...q,status:'ACTIVE',hideExpiredGuests:true});
     case 'listMembers':return this.family.members(tx,ctx,q);
     case 'updateMemberRole':return this.family.change(tx,ctx,p.memberId,b as DTO.RoleUpdate);
     case 'removeMember':return this.family.change(tx,ctx,p.memberId,{status:'REMOVED'});
     case 'leaveFamily':return this.family.change(tx,ctx,ctx.memberId!,{status:'LEFT'});
     case 'createInvite':return this.invites.create(tx,ctx,(b as DTO.InviteCreate).role);
     case 'listInvites':return this.invites.list(tx,ctx,q);
     case 'revokeInvite':return this.invites.revoke(tx,ctx,p.inviteId);
     case 'redeemInvite':return this.invites.redeem(tx,ctx,(b as DTO.RedeemRequest).code);
     case 'listDishes':case 'listAdminDishes':return this.dishes.list(tx,ctx,q,id==='listAdminDishes');
     case 'getDishDeletionPreview':return this.dishes.deletionPreview(tx,ctx,p.dishId);
     case 'getDish':case 'getAdminDish':return this.dishes.get(tx,ctx,p.dishId,id==='getAdminDish',q.sessionId as string|undefined);
     case 'createDish':return this.dishes.create(tx,ctx,b as DTO.DishCreate);
     case 'updateDish':return this.dishes.update(tx,ctx,p.dishId,b as DTO.DishUpdate);
     case 'deleteDish':return this.dishes.remove(tx,ctx,p.dishId,Number(q.expectedVersion));
     case 'createVariant':return this.dishes.createVariant(tx,ctx,p.dishId,b as DTO.VariantCreate);
     case 'updateVariant':return this.dishes.updateVariant(tx,ctx,p.dishId,p.variantId,b as DTO.VariantUpdate);
     case 'deleteVariant':return this.dishes.updateVariant(tx,ctx,p.dishId,p.variantId,{expectedVersion:Number(q.expectedVersion)},true);
     case 'promoteDish':return this.dishes.promote(tx,ctx,p.dishId,(b as DTO.VersionRequest).expectedVersion);
     case 'getFile':return this.files.get(tx,ctx,p.fileId);
     case 'listFileCleanupCandidates':return this.cleanup.candidates(tx,ctx,q);
     case 'getFileCleanupTask':return this.cleanup.task(tx,ctx,p.taskId);
     case 'requestFileCleanup':return this.cleanup.schedule(tx,ctx,p.fileId);
     case 'uploadFile':if(!req.file)fail(400,'VALIDATION_ERROR');return this.files.upload(tx,ctx,req.file.buffer);
    }
   });
   if(id==='requestFileCleanup')await this.cleanup.execute(req.params.familyId,(result.data as {taskId:string}).taskId);
   return res.status(result.status).json({data:result.data,requestId:req.requestId});
  }catch(e){if((e as {code?:string}).code==='P2002')fail(409,'DUPLICATE_NAME');throw e;}
 }
}
// Only owned operations are registered; the menu module owns its separate routes.
for(const id of baseOperations){
 const op=operations.get(id)!;
 Object.defineProperty(BaseController.prototype,id,{value:function(this:BaseController,req:ApiRequest,res:ApiResponse){return this.handle(id,req,res);},configurable:true});
 const descriptor=Object.getOwnPropertyDescriptor(BaseController.prototype,id)!;
 const decorator={get:Get,post:Post,patch:Patch,delete:Delete}[op.method];if(!decorator)throw new Error('Unsupported method');
 decorator(op.path.replace(/\{(\w+)\}/g,':$1'))(BaseController.prototype,id,descriptor);
 Req()(BaseController.prototype,id,0);Res()(BaseController.prototype,id,1);
 if(id==='uploadFile'||id==='uploadAvatar')UseInterceptors(FileInterceptor('file',{limits:{fileSize:5242880,files:1,fields:0}}))(BaseController.prototype,id,descriptor);
}
