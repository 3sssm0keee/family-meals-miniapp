import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../auth/auth.service.js';
import { PrismaService, type TransactionClient } from '../database/prisma.service.js';
import { AccessService } from './access.service.js';
import { IdempotencyService, hash } from './idempotency.service.js';
import { operations, validate, validateRequest, type ApiRequest } from './contract.js';
import type { RequestContext, WriteResult } from './context.js';
import { fail } from './errors.js';
@Injectable()
export class ApiRuntime {
 constructor(private readonly db:PrismaService,private readonly auth:AuthService,private readonly access:AccessService,private readonly idem:IdempotencyService){}
 async run<T>(id:string,req:ApiRequest,work:(tx:TransactionClient,ctx:RequestContext,query:Record<string,unknown>)=>Promise<T>):Promise<WriteResult<T>>{
  req.requestId=randomUUID();const op=operations.get(id);if(!op)throw new Error('Unknown operation');
  const query=validateRequest(op.spec,req),role=op.spec['x-required-role'];
  const userId=await this.auth.verify(req.headers.authorization);
  const ctx:RequestContext={requestId:req.requestId,userId,familyId:req.params.familyId};
  const write=op.method!=='get';const status=Number(Object.keys(op.spec.responses).find(s=>s.startsWith('2')));
  const authorize=async(tx:TransactionClient,replay:boolean)=>{
   if(!await tx.user.findUnique({where:{id:userId}}))fail(401,'UNAUTHENTICATED');
   if(role==='ADMIN'||role==='MEMBER'){
    // Self-leave/self-removal replay can only return the encrypted {ok:true} result.
    const selfReplay=replay&&(id==='leaveFamily'||(id==='removeMember'&&!!ctx.familyId&&await tx.familyMember.findFirst({where:{id:req.params.memberId,familyId:ctx.familyId,userId}})));
    if(selfReplay){await this.access.lockFamily(tx,ctx.familyId!);return;}
    Object.assign(ctx,await this.access.requireMember(tx,ctx,role==='ADMIN',write));
   }
  };
  const perform=async(tx:TransactionClient)=>{
   const data=await work(tx,ctx,query);
   try{validate(op.spec.responses[String(status)].content['application/json'].schema,{data,requestId:ctx.requestId});}catch{fail(500,'INTERNAL_ERROR');}
   return {status,data};
  };
  if(!write)return this.db.transaction(async tx=>{await authorize(tx,false);return perform(tx);});
  return this.idem.execute(ctx,{key:String(req.headers['idempotency-key']??''),method:op.method,path:'/api/v1'+op.path.replace(/\{(\w+)\}/g,(_,k)=>req.params[k]),body:req.body,query,fileHash:req.file?hash(req.file.buffer):undefined},authorize,perform);
 }
}
