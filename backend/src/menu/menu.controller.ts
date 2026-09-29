import { Controller, Get, Post, Put, Patch, Delete, Req, Res } from '@nestjs/common';
import { ApiRuntime } from '../common/api-runtime.service.js';
import { operations, type ApiRequest } from '../common/contract.js';
import type { ApiResponse } from '../common/base.controller.js';
import { MenuRuleError } from '../family-menu/domain.js';
import { fail, type ErrorCode } from '../common/errors.js';
import { MenuService } from './menu.service.js';
import type * as DTO from '../../../docs/contracts/frontend-types.js';

export const menuOperations = ['updateCartItemNote','updatePersonalItemNote','ensureSession','listSessions','getSession','getCart','addCartItem','removeCartItem','submitMenu','appendMenu','getPersonalMenu','updateNote','getFamilyMenu','getReview','reviewMenu','createTemporaryDish','getNotificationConfig','recordSubscriptionResult','listMyNotifications','listOperations'] as const;
@Controller()
export class MenuController {
 constructor(private readonly runtime:ApiRuntime,private readonly menus:MenuService){}
 async handle(id:typeof menuOperations[number],req:ApiRequest,res:ApiResponse){
  try {
   const result=await this.runtime.run(id,req,async(tx,ctx,q)=>{
    if(id==='ensureSession')return this.menus.ensure(tx,ctx,req.body as DTO.SessionEnsure);
    if(id==='listSessions')return this.menus.sessions(tx,ctx,q);
    if(['getNotificationConfig','recordSubscriptionResult','listMyNotifications','listOperations'].includes(id))return this.menus.auxiliary(tx,ctx,id,q,req.body);
    const s=await this.menus.session(tx,ctx,req.params.sessionId);
    switch(id){
     case 'getSession':return this.menus.sessionDto(tx,ctx,s);
     case 'getCart':return this.menus.cart(tx,ctx,s);
     case 'addCartItem':case 'removeCartItem':return this.menus.changeCart(tx,ctx,s,req.params.variantId,id==='addCartItem'?'ADD':'REMOVE');
     case 'submitMenu':return this.menus.submit(tx,ctx,s,req.body as DTO.SubmitRequest);
     case 'appendMenu':return this.menus.append(tx,ctx,s,req.body as DTO.AppendRequest);
     case 'getPersonalMenu':return this.menus.personal(tx,ctx,s);
     case 'updateCartItemNote':return this.menus.cartNote(tx,ctx,s,req.params.variantId,req.body as DTO.NoteUpdate);
     case 'updatePersonalItemNote':return this.menus.itemNote(tx,ctx,s,req.params.variantId,req.body as DTO.NoteUpdate);
     case 'updateNote':return this.menus.note(tx,ctx,s,req.body as DTO.NoteUpdate);
     case 'getFamilyMenu':case 'getReview':return this.menus.menu(tx,ctx,s,id==='getReview');
     case 'reviewMenu':return this.menus.review(tx,ctx,s,req.body as DTO.ReviewRequest);
     case 'createTemporaryDish':return this.menus.temporary(tx,ctx,s,req.body as DTO.DishCreate);
    }
   });
   return res.status(result.status).json({data:result.data,requestId:req.requestId});
  }catch(e){
   if(e instanceof MenuRuleError)fail(e.code==='NOT_FOUND'?404:e.code==='VALIDATION_ERROR'?400:409,e.code as ErrorCode,e.details);
   if((e as {code?:string}).code==='P2002')fail(409,'DUPLICATE_NAME');
   throw e;
  }
 }
}
for(const id of menuOperations){
 const op=operations.get(id)!;
 Object.defineProperty(MenuController.prototype,id,{value:function(this:MenuController,req:ApiRequest,res:ApiResponse){return this.handle(id,req,res);},configurable:true});
 const descriptor=Object.getOwnPropertyDescriptor(MenuController.prototype,id)!;
 const decorator={get:Get,post:Post,put:Put,patch:Patch,delete:Delete}[op.method];if(!decorator)throw new Error('Unsupported method');
 decorator(op.path.replace(/\{(\w+)\}/g,':$1'))(MenuController.prototype,id,descriptor);
 Req()(MenuController.prototype,id,0);Res()(MenuController.prototype,id,1);
}
