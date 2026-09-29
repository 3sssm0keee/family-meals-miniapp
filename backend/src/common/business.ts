import type { TransactionClient } from '../database/prisma.service.js';
import type { RequestContext } from './context.js';
import { fail } from './errors.js';
export function text(value:string){const s=value.trim();if(!s)fail(400,'VALIDATION_ERROR');return s;}
export function normalized(value:string){return text(value).normalize('NFC').toLowerCase();}
export function checkVersion(actual:number,expected:number){if(actual!==expected)fail(409,'VERSION_CONFLICT',{currentVersion:actual});}
export function page(query:Record<string,unknown>){const page=Number(query.page??1),pageSize=Number(query.pageSize??20);return {page,pageSize,skip:(page-1)*pageSize,take:pageSize};}
export async function audit(tx:TransactionClient,ctx:RequestContext,action:string,resourceId:string,sessionId?:string,summary=action){
 if(!ctx.familyId||!ctx.memberId)throw new Error('Family context required for audit');
 const actor=await tx.user.findUniqueOrThrow({where:{id:ctx.userId}});
 await tx.menuOperation.create({data:{familyId:ctx.familyId,actorMemberId:ctx.memberId,actorName:actor.displayName,action,resourceId,sessionId,reason:'',summary}});
}
