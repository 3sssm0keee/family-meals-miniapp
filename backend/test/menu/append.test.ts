import test from 'node:test';
import assert from 'node:assert/strict';
import { appendMenu, submitMenu, updateNote, type AvailableVariant } from '../../src/personal-menu/domain.ts';
import { applyReview, needsReview, participantIds, publicDishes, type MealState } from '../../src/family-menu/domain.ts';

const now = new Date('2026-09-18T04:00:00Z');
const empty = (): MealState => ({sessionId:'lunch',serviceDate:'2026-09-18',reviewVersion:1,items:[],submissions:[]});
const context = (ids: string[], memberId='member') => ({familyId:'family', memberId, personalMenuId:'pm_'+memberId, now,
  variants:new Map(ids.map(id=>[id,{familyId:'family',dishId:'dish_'+id,variantId:id,dishName:id,variantName:'normal',portionDescription:'one',dishKind:'PERMANENT',dishDeleted:false,variantDeleted:false,dishAvailable:true,variantAvailable:true,originSessionId:null} as AvailableVariant])),
  newItemIds:new Map(ids.map(id=>[id,'item_'+id]))});
const initial = () => submitMenu(empty(),{variantIds:['a'],note:'original'},context(['a']));
const approved = () => {const s=initial();return applyReview(s,{expectedReviewVersion:s.reviewVersion,items:[{itemId:'item_a',decision:'CONFIRMED',plannedQuantity:1,reason:'keep'}]},now);};
const append = (s:MealState,ids:string[],expectedVersion=1) => appendMenu(s,{variantIds:ids,expectedVersion},context(ids));
const code = (value:string) => (e:any) => e.code===value;

test('same member: initial approval -> append -> reapproval preserves original and public display',()=>{
  const before=approved(), next=append(before,['a','b']);
  assert.deepEqual(next.items[0],before.items[0]);
  assert.equal(next.submissions.length,1);
  assert.deepEqual(next.submissions[0],{...before.submissions[0],version:2,variantIds:['a','b']});
  assert.equal(next.reviewVersion,before.reviewVersion+1);
  assert.equal(needsReview(next.items[1]),true);
  assert.equal(next.items[1].decision,'UNREVIEWED');
  assert.equal(participantIds(next,'a').size,1);
  assert.throws(()=>applyReview(next,{expectedReviewVersion:before.reviewVersion,items:[{itemId:'item_b',decision:'CONFIRMED',plannedQuantity:1,reason:''}]},now),code('REVIEW_VERSION_CONFLICT'));
  const final=applyReview(next,{expectedReviewVersion:next.reviewVersion,items:[{itemId:'item_b',decision:'CONFIRMED',plannedQuantity:2,reason:''}]},now);
  assert.deepEqual(publicDishes(final).map(d=>d.variants.map(v=>[v.decision,v.needsReview,v.plannedQuantity])),[[['CONFIRMED',false,1]],[['CONFIRMED',false,2]]]);
  assert.deepEqual(before,approved());
});

test('append to another members approved or cancelled variant retains decision and adds exactly one participant',()=>{
  for(const decision of ['CONFIRMED','CANCELLED'] as const){
    let s=submitMenu(initial(),{variantIds:['b'],note:''},context(['b'],'other'));
    s=applyReview(s,{expectedReviewVersion:s.reviewVersion,items:[{itemId:'item_b',decision,plannedQuantity:decision==='CONFIRMED'?2:null,reason:'prior'}]},now);
    const next=append(s,['b']);
    assert.equal(next.items[1].decision,decision);
    assert.equal(next.items[1].demandVersion,s.items[1].demandVersion+1);
    assert.equal(participantIds(next,'b').size,2);
    assert.equal(needsReview(next.items[1]),true);
    assert.deepEqual(next.submissions[1],s.submissions[1]);
  }
});

test('duplicates, stale notes, invalid selections and historical writes cannot corrupt menu',()=>{
  const s=approved(), snapshot=structuredClone(s);
  assert.deepEqual(append(s,['a']),s);
  const next=append(s,['b']);
  assert.deepEqual(append(next,['a','b'],2),next);
  assert.throws(()=>append(next,['c']),code('VERSION_CONFLICT'));
  assert.throws(()=>updateNote(next,'member',{note:'stale',expectedVersion:1},now),code('VERSION_CONFLICT'));
  assert.throws(()=>append({...s,serviceDate:'2026-09-17'},['b']),code('DATE_READ_ONLY'));
  assert.throws(()=>append(empty(),['b']),code('NOT_FOUND'));
  for(const ids of [[],['b','b'],Array.from({length:100},(_,i)=>'v'+i)]) assert.throws(()=>append(s,ids),code('VALIDATION_ERROR'));
  for(const change of [{familyId:'other'},{dishDeleted:true},{variantAvailable:false},{dishKind:'TEMPORARY',originSessionId:'other'}]){
    const ctx=context(['b','c']);Object.assign(ctx.variants.get('c')!,change);
    assert.throws(()=>appendMenu(s,{variantIds:['b','c'],expectedVersion:1},ctx),code('VARIANT_UNAVAILABLE'));
  }
  assert.throws(()=>appendMenu(s,{variantIds:['a','missing'],expectedVersion:1},context(['a'])),(e:any)=>{
    assert.deepEqual(e.details.fieldErrors,[{field:'variantIds[1]',message:'VARIANT_UNAVAILABLE'}]);return true;
  });
  assert.deepEqual(s,snapshot);
});
