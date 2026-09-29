import { Injectable } from '@nestjs/common';
import type { TransactionClient } from '../database/prisma.service.js';
import type { RequestContext } from '../common/context.js';
import type { DishCreate,DishUpdate,VariantCreate,VariantUpdate } from '../../../docs/contracts/frontend-types.js';
import type { Dish,DishVariant } from '../../generated/prisma/client.js';
import { audit,checkVersion,normalized,page,text } from '../common/business.js';
import { fail } from '../common/errors.js';
import { FileService } from '../file/file.service.js';
@Injectable()
export class DishService {
 constructor(private readonly files:FileService){}
 private async asset(tx:TransactionClient,familyId:string,id:string|null|undefined){
  if(!id)return;
  if(!await tx.fileAsset.findUnique({where:{familyId_id:{familyId,id}}}))fail(404,'NOT_FOUND');
  const task=await tx.fileCleanupTask.findUnique({where:{familyId_fileId:{familyId,fileId:id}}});
  if(task&&task.status!=='SKIPPED')fail(409,'VALIDATION_ERROR');
 }
 private variant(v:VariantCreate){return {name:text(v.name),normalizedName:normalized(v.name),activeNameKey:normalized(v.name),portionDescription:text(v.portionDescription),description:v.description,isAvailable:v.isAvailable};}
 async dto(tx:TransactionClient,d:Dish,admin=true){const variants=await tx.dishVariant.findMany({where:{familyId:d.familyId,dishId:d.id,deletedAt:admin?d.deletedAt:null,...(admin?{}:{isAvailable:true})},orderBy:[{createdAt:'desc'},{id:'desc'}]});return {id:d.id,name:d.name,description:d.description,image:await this.files.image(tx,d.familyId,d.imageFileId),isAvailable:d.isAvailable,kind:d.kind,originSessionId:d.originSessionId,version:d.version,deletedAt:d.deletedAt?.toISOString()??null,variants:variants.map(v=>this.variantDto(v))};}
 private variantDto(v:DishVariant){return {id:v.id,name:v.name,portionDescription:v.portionDescription,description:v.description,isAvailable:v.isAvailable,version:v.version,deletedAt:v.deletedAt?.toISOString()??null};}
 async getEntity(tx:TransactionClient,familyId:string,id:string,allowDeleted=false){const d=await tx.dish.findUnique({where:{familyId_id:{familyId,id}}});if(!d||(!allowDeleted&&d.deletedAt))fail(404,'NOT_FOUND');return d;}
 private async session(tx:TransactionClient,familyId:string,id:string){const s=await tx.mealSession.findUnique({where:{familyId_id:{familyId,id}}});if(!s)fail(404,'NOT_FOUND');return s;}
 async get(tx:TransactionClient,ctx:RequestContext,id:string,admin:boolean,sessionId?:string){const d=await this.getEntity(tx,ctx.familyId!,id,admin);if(!admin){await this.session(tx,ctx.familyId!,sessionId!);if(!d.isAvailable||d.deletedAt||d.kind==='TEMPORARY'&&d.originSessionId!==sessionId||!await tx.dishVariant.count({where:{familyId:ctx.familyId,dishId:id,deletedAt:null,isAvailable:true}}))fail(404,'NOT_FOUND');}return this.dto(tx,d,admin);}
 async list(tx:TransactionClient,ctx:RequestContext,q:Record<string,unknown>,admin:boolean){
  const p=page(q),sessionId=q.sessionId as string|undefined;if(sessionId)await this.session(tx,ctx.familyId!,sessionId);
  const selectable={isAvailable:true,dishVariant_dish:{some:{deletedAt:null,isAvailable:true}}};
  const mealScope=[{kind:'PERMANENT' as const},...(sessionId?[{kind:'TEMPORARY' as const,originSessionId:sessionId}]:[])];
  const where={familyId:ctx.familyId!,...(admin&&q.onlyDeleted===true?{deletedAt:{not:null}}:q.includeDeleted===true&&admin?{}:{deletedAt:null}),...(!admin?selectable:{}),...(q.q?{name:{contains:String(q.q)}}:{}),OR:admin&&!sessionId?[...mealScope,{kind:'TEMPORARY' as const}]:mealScope};
  const total=await tx.dish.count({where}),rows=await tx.dish.findMany({where,orderBy:[{createdAt:'desc'},{id:'desc'}],skip:p.skip,take:p.take});
  const items=await Promise.all(rows.map(d=>this.dto(tx,d,admin)));
  if(!admin)return {items,page:p.page,pageSize:p.pageSize,total};
  const selectableCount=await tx.dish.count({where:{familyId:ctx.familyId!,deletedAt:null,...selectable,OR:mealScope}});
  return {items,page:p.page,pageSize:p.pageSize,total,selectableCount};
 }
 async deletionPreview(tx:TransactionClient,ctx:RequestContext,id:string){
  const d=await this.getEntity(tx,ctx.familyId!,id,true);
  const variants=await tx.dishVariant.findMany({where:{familyId:ctx.familyId,dishId:id},select:{id:true}});
  const variantIds=variants.map(v=>v.id);
  const [cartItemCount,submittedItemCount,menuItemCount,pendingReviewItemCount,confirmedItemCount]=await Promise.all([
   tx.cartItem.count({where:{familyId:ctx.familyId,variantId:{in:variantIds}}}),
   tx.personalMenuItem.count({where:{familyId:ctx.familyId,variantId:{in:variantIds}}}),
   tx.familyMenuItem.count({where:{familyId:ctx.familyId,dishId:id}}),
   tx.familyMenuItem.count({where:{familyId:ctx.familyId,dishId:id,decision:'UNREVIEWED'}}),
   tx.familyMenuItem.count({where:{familyId:ctx.familyId,dishId:id,decision:'CONFIRMED'}}),
  ]);
  return {dishId:d.id,name:d.name,expectedVersion:d.version,deletedAt:d.deletedAt?.toISOString()??null,variantCount:variantIds.length,cartItemCount,submittedItemCount,menuItemCount,pendingReviewItemCount,confirmedItemCount,hasImage:!!d.imageFileId};
 }
 // Caller already holds the family lock. This method owns dish/variants only.
 // Menu task creates zero-demand FamilyMenuItem snapshots in the SAME transaction.
 async create(tx:TransactionClient,ctx:RequestContext,body:DishCreate,originSessionId?:string){
  if(originSessionId){const s=await this.session(tx,ctx.familyId!,originSessionId);if(s.serviceDate.toISOString().slice(0,10)!==new Date(Date.now()+28800000).toISOString().slice(0,10))fail(409,'DATE_READ_ONLY');}
  await this.asset(tx,ctx.familyId!,body.imageFileId);
  const name=normalized(body.name);const variants=body.variants.map(v=>this.variant(v));if(new Set(variants.map(v=>v.normalizedName)).size!==variants.length)fail(409,'DUPLICATE_NAME');
  const d=await tx.dish.create({data:{familyId:ctx.familyId!,name:text(body.name),normalizedName:name,activeNameKey:originSessionId?`T:${originSessionId}:${name}`:`P:${name}`,description:body.description,imageFileId:body.imageFileId,isAvailable:body.isAvailable,kind:originSessionId?'TEMPORARY':'PERMANENT',originSessionId}});
  await tx.dishVariant.createMany({data:variants.map(v=>({...v,familyId:d.familyId,dishId:d.id}))});await audit(tx,ctx,originSessionId?'TEMPORARY_CREATE':'DISH_CREATE',d.id,originSessionId,`${originSessionId?'添加临时菜':'添加菜品'}「${d.name}」`);return this.dto(tx,d);
 }
 async update(tx:TransactionClient,ctx:RequestContext,id:string,b:DishUpdate){const d=await this.getEntity(tx,ctx.familyId!,id);checkVersion(d.version,b.expectedVersion);await this.asset(tx,d.familyId,b.imageFileId);const name=b.name===undefined?undefined:normalized(b.name);const row=await tx.dish.update({where:{id},data:{name:b.name===undefined?undefined:text(b.name),normalizedName:name,activeNameKey:name===undefined?undefined:d.kind==='PERMANENT'?`P:${name}`:`T:${d.originSessionId}:${name}`,description:b.description,imageFileId:b.imageFileId,isAvailable:b.isAvailable,version:{increment:1}}});await audit(tx,ctx,'DISH_UPDATE',id,undefined,d.name===row.name?`修改菜品「${d.name}」`:`将菜品「${d.name}」改名为「${row.name}」`);return this.dto(tx,row);}
 async remove(tx:TransactionClient,ctx:RequestContext,id:string,version:number){
  const d=await this.getEntity(tx,ctx.familyId!,id,true);checkVersion(d.version,version);
  const variants=await tx.dishVariant.findMany({where:{familyId:ctx.familyId,dishId:id},select:{id:true}});
  const variantIds=variants.map(v=>v.id);
  const menuGaps=await tx.$queryRaw<Array<{count:bigint}>>`
   SELECT COUNT(*) AS count FROM family_menu_item
   WHERE family_id=${ctx.familyId!} AND dish_id=${id}
   AND (TRIM(dish_name)='' OR TRIM(variant_name)='' OR TRIM(portion_description)='')`;
  const personalGaps=await tx.$queryRaw<Array<{count:bigint}>>`
   SELECT COUNT(*) AS count FROM personal_menu_item p
   JOIN family_menu_item f ON f.family_id=p.family_id AND f.id=p.family_menu_item_id
   WHERE p.family_id=${ctx.familyId!} AND f.dish_id=${id}
   AND (TRIM(p.dish_name)='' OR TRIM(p.variant_name)='' OR TRIM(p.portion_description)='')`;
  if(Number(menuGaps[0].count)||Number(personalGaps[0].count))fail(409,'VALIDATION_ERROR',{fieldErrors:[{field:'history',message:'历史菜名、规格或份量快照缺失，暂不可删除'}]});
  const carts=await tx.cart.findMany({where:{familyId:ctx.familyId,cartItem_cart:{some:{variantId:{in:variantIds}}}},select:{id:true}});
  const removed=await tx.cartItem.deleteMany({where:{familyId:ctx.familyId,variantId:{in:variantIds}}});
  if(carts.length)await tx.cart.updateMany({where:{familyId:ctx.familyId,id:{in:carts.map(c=>c.id)}},data:{version:{increment:1}}});
  await tx.dishVariant.deleteMany({where:{familyId:ctx.familyId,dishId:id}});
  await tx.dish.delete({where:{familyId_id:{familyId:ctx.familyId!,id}}});
  await audit(tx,ctx,'DISH_DELETE',id,undefined,`删除菜品「${d.name}」及${variantIds.length}个规格，清除${removed.count}个购物车项，保留历史点单`);
  return {ok:true as const};
 }
 async createVariant(tx:TransactionClient,ctx:RequestContext,id:string,b:VariantCreate){const d=await this.getEntity(tx,ctx.familyId!,id);if(await tx.dishVariant.count({where:{dishId:id,familyId:ctx.familyId,deletedAt:null}})>=20)fail(400,'VALIDATION_ERROR');const v=await tx.dishVariant.create({data:{...this.variant(b),familyId:ctx.familyId!,dishId:id}});await tx.dish.update({where:{id},data:{version:{increment:1}}});await audit(tx,ctx,'VARIANT_CREATE',v.id,undefined,`为菜品「${d.name}」添加规格「${v.name}」`);return this.variantDto(v);}
 async updateVariant(tx:TransactionClient,ctx:RequestContext,dishId:string,id:string,b:VariantUpdate|{expectedVersion:number},remove=false){
  const d=await this.getEntity(tx,ctx.familyId!,dishId);const v=await tx.dishVariant.findFirst({where:{id,dishId,familyId:ctx.familyId,deletedAt:null}});if(!v)fail(404,'NOT_FOUND');checkVersion(v.version,b.expectedVersion);
  if(remove&&await tx.dishVariant.count({where:{dishId,familyId:ctx.familyId,deletedAt:null}})<=1)fail(400,'VALIDATION_ERROR');
  const body=b as VariantUpdate,name=body.name===undefined?undefined:normalized(body.name);
  const row=await tx.dishVariant.update({where:{id},data:remove?{deletedAt:new Date(),activeNameKey:null,version:{increment:1}}:{name:body.name===undefined?undefined:text(body.name),normalizedName:name,activeNameKey:name,portionDescription:body.portionDescription===undefined?undefined:text(body.portionDescription),description:body.description,isAvailable:body.isAvailable,version:{increment:1}}});
  await tx.dish.update({where:{id:dishId},data:{version:{increment:1}}});await audit(tx,ctx,remove?'VARIANT_DELETE':'VARIANT_UPDATE',id,undefined,remove?`从菜品「${d.name}」删除规格「${v.name}」`:v.name===row.name?`修改菜品「${d.name}」的规格「${v.name}」`:`将菜品「${d.name}」的规格「${v.name}」改名为「${row.name}」`);return remove?{ok:true as const}:this.variantDto(row);
 }
 async promote(tx:TransactionClient,ctx:RequestContext,id:string,version:number){const d=await this.getEntity(tx,ctx.familyId!,id);if(d.kind!=='TEMPORARY')fail(409,'TEMPORARY_ONLY');checkVersion(d.version,version);const row=await tx.dish.update({where:{id},data:{kind:'PERMANENT',activeNameKey:'P:'+d.normalizedName,version:{increment:1}}});await audit(tx,ctx,'DISH_PROMOTE',id,undefined,`将临时菜「${d.name}」转为正式菜`);return this.dto(tx,row);}
}
