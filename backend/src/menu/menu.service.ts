import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { TransactionClient } from '../database/prisma.service.js';
import type { RequestContext } from '../common/context.js';
import type * as DTO from '../../../docs/contracts/frontend-types.js';
import type { MealSession } from '../../generated/prisma/client.js';
import { DishService } from '../dish/dish.service.js';
import { checkVersion, page } from '../common/business.js';
import { fail } from '../common/errors.js';
import { shanghaiDate, requireToday, submitBlockedReason, publicDishes, reviewDishes, newDemandItem, needsReview, participantIds, type MealState } from '../family-menu/domain.js';
import { appendMenu, submitMenu, updateNote, type AvailableVariant } from '../personal-menu/domain.js';
import { changeCart } from '../cart/domain.js';
import { planReview } from '../notification/domain.js';

@Injectable()
export class MenuService {
 constructor(private readonly dishes: DishService) {}

 // ApiRuntime holds the family write lock first. Reads also lock the session so
 // multi-query snapshots cannot mix demand before/after a concurrent submission.
 async session(tx: TransactionClient, ctx: RequestContext, id: string) {
  const rows = await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM meal_session WHERE family_id = ${ctx.familyId!} AND id = ${id} FOR UPDATE`;
  if (!rows.length) fail(404, 'NOT_FOUND');
  const s = await tx.mealSession.findUniqueOrThrow({where:{id}});
  this.readDate(s.serviceDate.toISOString().slice(0,10));
  return s;
 }
 private readDate(date: string) {
  const today = shanghaiDate(new Date()), lower = new Date(today);
  lower.setUTCMonth(lower.getUTCMonth()-6);
  if (date > today || date < lower.toISOString().slice(0,10)) fail(400,'VALIDATION_ERROR');
 }
 async sessionDto(tx: TransactionClient, ctx: RequestContext, s: MealSession): Promise<DTO.Session> {
  const submitted = !!await tx.personalMenu.findUnique({where:{sessionId_memberId:{sessionId:s.id,memberId:ctx.memberId!}}});
  const now = new Date(), date = s.serviceDate.toISOString().slice(0,10), blocked = submitBlockedReason(date,submitted,now);
  return {id:s.id,serviceDate:date,mealType:s.mealType,timezone:'Asia/Shanghai',serverTime:now.toISOString(),canSubmit:blocked===null,canAppend:submitted&&date===shanghaiDate(now),submitBlockedReason:blocked,reviewVersion:s.reviewVersion};
 }
 async ensure(tx:TransactionClient,ctx:RequestContext,b:DTO.SessionEnsure) {
  requireToday(b.serviceDate,new Date());
  const key={familyId:ctx.familyId!,serviceDate:new Date(b.serviceDate),mealType:b.mealType};
  const s=await tx.mealSession.upsert({where:{familyId_serviceDate_mealType:key},create:key,update:{}});
  return this.sessionDto(tx,ctx,s);
 }
 async sessions(tx:TransactionClient,ctx:RequestContext,q:Record<string,unknown>) {
  const date=String(q.serviceDate);this.readDate(date);
  const rows=await tx.mealSession.findMany({where:{familyId:ctx.familyId,serviceDate:new Date(date),mealType:q.mealType as DTO.Session['mealType']|undefined},orderBy:{mealType:'asc'}});
  return Promise.all(rows.map(s=>this.sessionDto(tx,ctx,s)));
 }
 async state(tx:TransactionClient,ctx:RequestContext,s:MealSession):Promise<MealState> {
  const rows=await tx.familyMenuItem.findMany({where:{familyId:ctx.familyId,sessionId:s.id},orderBy:{id:'asc'}});
  const menus=await tx.personalMenu.findMany({where:{familyId:ctx.familyId,sessionId:s.id},include:{personalMenuItem_personalMenu:true}});
  return {sessionId:s.id,serviceDate:s.serviceDate.toISOString().slice(0,10),reviewVersion:s.reviewVersion,
   items:rows.map(r=>({id:r.id,dishId:r.dishId,variantId:r.variantId,dishName:r.dishName,variantName:r.variantName,portionDescription:r.portionDescription,dishKind:r.dishKind,decision:r.decision,plannedQuantity:r.plannedQuantity===null?null:Number(r.plannedQuantity),reason:r.reason,demandVersion:r.demandVersion,reviewedDemandVersion:r.reviewedDemandVersion,lastReviewedParticipantCount:r.lastReviewedParticipantCount})),
   submissions:menus.map(m=>({id:m.id,memberId:m.memberId,submittedAt:m.submittedAt.toISOString(),note:m.note,version:m.version,variantIds:m.personalMenuItem_personalMenu.map(i=>i.variantId),itemNotes:Object.fromEntries(m.personalMenuItem_personalMenu.map(i=>[i.variantId,{note:i.note,noteUpdatedAt:i.noteUpdatedAt?.toISOString()??null,noteUpdatedAfterReview:i.noteUpdatedAfterReview}]))}))};
 }
 private async variant(tx:TransactionClient,ctx:RequestContext,id:string):Promise<AvailableVariant|null> {
  const v=await tx.dishVariant.findUnique({where:{familyId_id:{familyId:ctx.familyId!,id}},include:{dish:true}});
  if(!v)return null;
  return {familyId:v.familyId,dishId:v.dishId,variantId:v.id,dishName:v.dish.name,variantName:v.name,portionDescription:v.portionDescription,dishKind:v.dish.kind,dishDeleted:!!v.dish.deletedAt,variantDeleted:!!v.deletedAt,dishAvailable:v.dish.isAvailable,variantAvailable:v.isAvailable,originSessionId:v.dish.originSessionId};
 }
 private unavailable(v:AvailableVariant|null,sessionId:string):DTO.CartItem['unavailableReason'] {
  if(!v||v.dishDeleted||v.variantDeleted)return 'DELETED';
  if(!v.dishAvailable||!v.variantAvailable)return 'UNAVAILABLE';
  return v.dishKind==='TEMPORARY'&&v.originSessionId!==sessionId?'WRONG_SESSION':null;
 }
 async cart(tx:TransactionClient,ctx:RequestContext,s:MealSession):Promise<DTO.Cart> {
  const cart=await tx.cart.findUnique({where:{sessionId_memberId:{sessionId:s.id,memberId:ctx.memberId!}},include:{cartItem_cart:true}});
  const items:DTO.CartItem[]=[];
  for(const i of cart?.cartItem_cart??[]) {
   const v=await this.variant(tx,ctx,i.variantId);if(!v)fail(500,'INTERNAL_ERROR');
   const reason=this.unavailable(v,s.id);
   items.push({note:i.note,dishId:v.dishId,variantId:v.variantId,dishName:v.dishName,variantName:v.variantName,portionDescription:v.portionDescription,isSelectable:reason===null,unavailableReason:reason});
  }
  return {sessionId:s.id,version:cart?.version??1,items};
 }
 async changeCart(tx:TransactionClient,ctx:RequestContext,s:MealSession,id:string,action:'ADD'|'REMOVE') {
  const before=await this.cart(tx,ctx,s),submitted=!!await tx.personalMenu.findUnique({where:{sessionId_memberId:{sessionId:s.id,memberId:ctx.memberId!}}});
  const next=changeCart({version:before.version,variantIds:before.items.map(i=>i.variantId)},id,action,{serviceDate:s.serviceDate.toISOString().slice(0,10),submitted,now:new Date()});
  if(action==='ADD'&&this.unavailable(await this.variant(tx,ctx,id),s.id))fail(409,'VARIANT_UNAVAILABLE');
  if(next.version!==before.version){
   const cart=await tx.cart.upsert({where:{sessionId_memberId:{sessionId:s.id,memberId:ctx.memberId!}},create:{familyId:ctx.familyId!,sessionId:s.id,memberId:ctx.memberId!,version:next.version},update:{version:next.version}});
   if(action==='ADD')await tx.cartItem.create({data:{familyId:ctx.familyId!,cartId:cart.id,variantId:id}});
   else await tx.cartItem.deleteMany({where:{familyId:ctx.familyId,cartId:cart.id,variantId:id}});
  }
  return this.cart(tx,ctx,s);
 }
 async personal(tx:TransactionClient,ctx:RequestContext,s:MealSession):Promise<DTO.PersonalMenu|null> {
  const m=await tx.personalMenu.findUnique({where:{sessionId_memberId:{sessionId:s.id,memberId:ctx.memberId!}},include:{personalMenuItem_personalMenu:{include:{familyMenuItem:true}}}});
  if(!m)return null;
  const dishIds=[...new Set(m.personalMenuItem_personalMenu.map(i=>i.familyMenuItem.dishId))];
  const existing=new Set((await tx.dish.findMany({where:{familyId:ctx.familyId,id:{in:dishIds}},select:{id:true}})).map(d=>d.id));
  return {id:m.id,sessionId:s.id,submittedAt:m.submittedAt.toISOString(),note:m.note,version:m.version,items:m.personalMenuItem_personalMenu.map(i=>{
   const f=i.familyMenuItem;return {note:i.note,noteUpdatedAt:i.noteUpdatedAt?.toISOString()??null,noteUpdatedAfterReview:i.noteUpdatedAfterReview,dishId:f.dishId,dishDeleted:!existing.has(f.dishId),variantId:i.variantId,dishName:i.dishName,variantName:i.variantName,portionDescription:i.portionDescription,decision:f.decision,needsReview:f.decision==='UNREVIEWED'||f.demandVersion>f.reviewedDemandVersion,plannedQuantity:f.plannedQuantity===null?null:Number(f.plannedQuantity),unit:'PORTION',reason:f.reason};
  })};
 }
 private async saveState(tx:TransactionClient,ctx:RequestContext,next:MealState) {
  for(const item of next.items)await tx.familyMenuItem.upsert({where:{id:item.id},create:{...item,familyId:ctx.familyId!,sessionId:next.sessionId},update:{demandVersion:item.demandVersion,decision:item.decision,plannedQuantity:item.plannedQuantity,reason:item.reason,reviewedDemandVersion:item.reviewedDemandVersion,lastReviewedParticipantCount:item.lastReviewedParticipantCount}});
  await tx.mealSession.update({where:{id:next.sessionId},data:{reviewVersion:next.reviewVersion}});
 }
 async submit(tx:TransactionClient,ctx:RequestContext,s:MealSession,b:DTO.SubmitRequest) {
  const state=await this.state(tx,ctx,s),variants=new Map<string,AvailableVariant>();
  const draftNotes=new Map((await this.cart(tx,ctx,s)).items.map(i=>[i.variantId,i.note??'']));
  for(const id of b.variantIds){const v=await this.variant(tx,ctx,id);if(v)variants.set(id,v);}
  const id=randomUUID(),next=submitMenu(state,b,{familyId:ctx.familyId!,memberId:ctx.memberId!,personalMenuId:id,now:new Date(),variants,newItemIds:new Map(b.variantIds.map(v=>[v,randomUUID()]))});
  await this.saveState(tx,ctx,next);
  await tx.personalMenu.create({data:{id,familyId:ctx.familyId!,sessionId:s.id,memberId:ctx.memberId!,note:b.note,submittedAt:new Date(next.submissions.at(-1)!.submittedAt)}});
  for(const variantId of b.variantIds){const item=next.items.find(i=>i.variantId===variantId)!;await tx.personalMenuItem.create({data:{familyId:ctx.familyId!,personalMenuId:id,familyMenuItemId:item.id,variantId,note:draftNotes.get(variantId)??'',dishName:item.dishName,variantName:item.variantName,portionDescription:item.portionDescription}});}
  const cart=await tx.cart.upsert({where:{sessionId_memberId:{sessionId:s.id,memberId:ctx.memberId!}},create:{familyId:ctx.familyId!,sessionId:s.id,memberId:ctx.memberId!,version:2},update:{version:{increment:1}}});
  await tx.cartItem.deleteMany({where:{familyId:ctx.familyId,cartId:cart.id}});
  return this.personal(tx,ctx,s);
 }
 async append(tx:TransactionClient,ctx:RequestContext,s:MealSession,b:DTO.AppendRequest) {
  const state=await this.state(tx,ctx,s),variants=new Map<string,AvailableVariant>();
  const draftNotes=new Map((await this.cart(tx,ctx,s)).items.map(i=>[i.variantId,i.note??'']));
  for(const id of b.variantIds){const v=await this.variant(tx,ctx,id);if(v)variants.set(id,v);}
  const next=appendMenu(state,b,{familyId:ctx.familyId!,memberId:ctx.memberId!,personalMenuId:randomUUID(),now:new Date(),variants,newItemIds:new Map(b.variantIds.map(v=>[v,randomUUID()]))});
  const before=state.submissions.find(m=>m.memberId===ctx.memberId!)!,menu=next.submissions.find(m=>m.memberId===ctx.memberId!)!;
  if(menu.version!==before.version){
   await this.saveState(tx,ctx,next);
   await tx.personalMenu.update({where:{id:menu.id},data:{version:menu.version}});
   for(const variantId of menu.variantIds.filter(v=>!before.variantIds.includes(v))){
    const item=next.items.find(i=>i.variantId===variantId)!;
    await tx.personalMenuItem.create({data:{familyId:ctx.familyId!,personalMenuId:menu.id,familyMenuItemId:item.id,variantId,note:draftNotes.get(variantId)??'',dishName:item.dishName,variantName:item.variantName,portionDescription:item.portionDescription}});
   }
  }
  const cart=await tx.cart.findUnique({where:{sessionId_memberId:{sessionId:s.id,memberId:ctx.memberId!}}});
  if(cart){
   const removed=await tx.cartItem.deleteMany({where:{familyId:ctx.familyId,cartId:cart.id,variantId:{in:b.variantIds}}});
   if(removed.count)await tx.cart.update({where:{id:cart.id},data:{version:{increment:1}}});
  }
  return this.personal(tx,ctx,s);
 }
 async cartNote(tx:TransactionClient,ctx:RequestContext,s:MealSession,variantId:string,b:DTO.NoteUpdate) {
  requireToday(s.serviceDate.toISOString().slice(0,10),new Date());
  const before=await this.cart(tx,ctx,s);checkVersion(before.version,b.expectedVersion);
  const pm=await tx.personalMenu.findUnique({where:{sessionId_memberId:{sessionId:s.id,memberId:ctx.memberId!}},include:{personalMenuItem_personalMenu:true}});
  if(pm?.personalMenuItem_personalMenu.some(i=>i.variantId===variantId))fail(409,'ALREADY_SUBMITTED');
  if(this.unavailable(await this.variant(tx,ctx,variantId),s.id))fail(409,'VARIANT_UNAVAILABLE');
  const existing=before.items.find(i=>i.variantId===variantId);
  if(existing?.note===b.note)return before;
  if(!existing&&before.items.length>=100)fail(400,'VALIDATION_ERROR');
  const cart=await tx.cart.upsert({where:{sessionId_memberId:{sessionId:s.id,memberId:ctx.memberId!}},create:{familyId:ctx.familyId!,sessionId:s.id,memberId:ctx.memberId!,version:2},update:{version:{increment:1}}});
  await tx.cartItem.upsert({where:{cartId_variantId:{cartId:cart.id,variantId}},create:{familyId:ctx.familyId!,cartId:cart.id,variantId,note:b.note},update:{note:b.note}});
  return this.cart(tx,ctx,s);
 }
 async itemNote(tx:TransactionClient,ctx:RequestContext,s:MealSession,variantId:string,b:DTO.NoteUpdate) {
  requireToday(s.serviceDate.toISOString().slice(0,10),new Date());
  const m=await tx.personalMenu.findUnique({where:{sessionId_memberId:{sessionId:s.id,memberId:ctx.memberId!}},include:{personalMenuItem_personalMenu:{include:{familyMenuItem:true}}}});
  if(!m)fail(404,'NOT_FOUND');checkVersion(m.version,b.expectedVersion);
  const item=m.personalMenuItem_personalMenu.find(i=>i.variantId===variantId);
  if(!item)fail(404,'NOT_FOUND');
  if(item.note===b.note)return this.personal(tx,ctx,s);
  await tx.personalMenuItem.update({where:{id:item.id},data:{note:b.note,noteUpdatedAt:new Date(),noteUpdatedAfterReview:item.noteUpdatedAfterReview||item.familyMenuItem.reviewedDemandVersion>0}});
  await tx.personalMenu.update({where:{id:m.id},data:{version:{increment:1}}});
  // Invalidate stale review drafts without changing demand or the existing decision.
  await tx.mealSession.update({where:{id:s.id},data:{reviewVersion:{increment:1}}});
  return this.personal(tx,ctx,s);
 }
 async note(tx:TransactionClient,ctx:RequestContext,s:MealSession,b:DTO.NoteUpdate) {
  const next=updateNote(await this.state(tx,ctx,s),ctx.memberId!,b,new Date()),m=next.submissions.find(m=>m.memberId===ctx.memberId)!;
  await this.saveState(tx,ctx,next);await tx.personalMenu.update({where:{id:m.id},data:{note:m.note,version:m.version}});
  return this.personal(tx,ctx,s);
 }
 async menu(tx:TransactionClient,ctx:RequestContext,s:MealSession,admin=false) {
  const state=await this.state(tx,ctx,s),session=await this.sessionDto(tx,ctx,s);
  const dishIds=[...new Set(state.items.map(i=>i.dishId))];
  const existing=new Set((await tx.dish.findMany({where:{familyId:ctx.familyId,id:{in:dishIds}},select:{id:true}})).map(d=>d.id));
  const markDeleted=<T extends {dishId:string}>(dishes:T[])=>dishes.map(d=>({...d,dishDeleted:!existing.has(d.dishId)}));
  if(!admin)return {session,dishes:markDeleted(publicDishes(state))};
  const members=await tx.familyMember.findMany({where:{familyId:ctx.familyId},include:{user:true}});
  const first=await tx.reviewBatch.findFirst({where:{familyId:ctx.familyId,sessionId:s.id},orderBy:{toVersion:'asc'}});
  const snapshot=first?.snapshot as {menu:DTO.Menu}|undefined;
  const initialIds=new Set(snapshot?.menu.dishes.flatMap(d=>d.variants.map(v=>v.itemId))??[]);
  const hasTemporaryAdditions=!!first&&state.items.some(i=>needsReview(i)&&(
   (i.reviewedDemandVersion===0&&!initialIds.has(i.id)) ||
   (i.reviewedDemandVersion>0&&participantIds(state,i.variantId).size>i.lastReviewedParticipantCount)
  ));
  return {session,dishes:markDeleted(reviewDishes(state,new Map(members.map(m=>[m.id,m.user.displayName])))),hasTemporaryAdditions,hasNoteUpdates:state.submissions.some(m=>Object.values(m.itemNotes??{}).some(n=>n.noteUpdatedAfterReview))};
 }
 async review(tx:TransactionClient,ctx:RequestContext,s:MealSession,b:DTO.ReviewRequest) {
  const state=await this.state(tx,ctx,s),members=await tx.familyMember.findMany({where:{familyId:ctx.familyId,status:'ACTIVE',OR:[{accessExpiresAt:null},{accessExpiresAt:{gt:new Date()}}]},include:{user:true}});
  // Delivery remains explicitly disabled until a real provider is configured.
  const plan=planReview(state,b,{batchId:randomUUID(),actorMemberId:ctx.memberId!,actorName:members.find(m=>m.id===ctx.memberId)!.user.displayName,session:await this.sessionDto(tx,ctx,s),now:new Date(),activeMemberIds:new Set(members.map(m=>m.id)),channelEnabled:false,eligibleMemberIds:new Set()});
  await this.saveState(tx,ctx,plan.state);
  await tx.reviewBatch.create({data:{...plan.batch,snapshot:{changes:plan.batch.snapshot.changes,menu:plan.batch.snapshot.menu},familyId:ctx.familyId!,sessionId:s.id,actorMemberId:ctx.memberId!}});
  if(plan.notifications.length)await tx.notification.createMany({data:plan.notifications.map(n=>({...n,familyId:ctx.familyId!}))});
  await tx.menuOperation.create({data:{...plan.audit,familyId:ctx.familyId!}});
  return {batchId:plan.batch.id,review:await this.menu(tx,ctx,{...s,reviewVersion:plan.state.reviewVersion},true),notificationRecordCount:plan.notifications.length};
 }
 async temporary(tx:TransactionClient,ctx:RequestContext,s:MealSession,b:DTO.DishCreate) {
  requireToday(s.serviceDate.toISOString().slice(0,10),new Date());
  const dish=await this.dishes.create(tx,ctx,b,s.id);
  for(const v of dish.variants)await tx.familyMenuItem.create({data:{...newDemandItem(randomUUID(),{dishId:dish.id,variantId:v.id,dishName:dish.name,variantName:v.name,portionDescription:v.portionDescription,dishKind:'TEMPORARY'}),familyId:ctx.familyId!,sessionId:s.id}});
  await tx.mealSession.update({where:{id:s.id},data:{reviewVersion:{increment:1}}});return dish;
 }
 async auxiliary(tx:TransactionClient,ctx:RequestContext,id:string,q:Record<string,unknown>,body:unknown) {
  if(id==='getNotificationConfig')return {enabled:false,templateId:null};
  if(id==='recordSubscriptionResult'){const b=body as DTO.SubscriptionResultRequest;await tx.subscriptionEvent.create({data:{...b,familyId:ctx.familyId!,memberId:ctx.memberId!,recordedAt:new Date()}});return {ok:true};}
  const p=page(q),orderBy=[{createdAt:'desc' as const},{id:'desc' as const}];
  if(id==='listMyNotifications'){
   const where={familyId:ctx.familyId,memberId:ctx.memberId},total=await tx.notification.count({where});
   const rows=await tx.notification.findMany({where,orderBy,skip:p.skip,take:p.take});
   return {items:rows.map(r=>({id:r.id,batchId:r.batchId,status:r.status,createdAt:r.createdAt.toISOString(),sentAt:r.sentAt?.toISOString()??null,reasonCode:r.reasonCode})),page:p.page,pageSize:p.pageSize,total};
  }
  if(q.sessionId)await this.session(tx,ctx,String(q.sessionId));
  const where={familyId:ctx.familyId,sessionId:q.sessionId as string|undefined},total=await tx.menuOperation.count({where});
  const rows=await tx.menuOperation.findMany({where,orderBy,skip:p.skip,take:p.take});
  return {items:rows.map(r=>({id:r.id,actorMemberId:r.actorMemberId,actorName:r.actorName,action:r.action,resourceId:r.resourceId,reason:r.reason,summary:r.summary,createdAt:r.createdAt.toISOString()})),page:p.page,pageSize:p.pageSize,total};
 }
}
