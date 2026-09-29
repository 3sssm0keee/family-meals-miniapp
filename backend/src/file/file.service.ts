import { MAX_UPLOAD_BYTES, encodeTicket, decodeTicket } from './direct-upload.js';
import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { putAsset, readAsset, storageDriver, createDirectUpload, readPendingUpload, assetUrl } from './storage.js';
import sharp from 'sharp';
import type { TransactionClient } from '../database/prisma.service.js';
import type { RequestContext } from '../common/context.js';
import type { FileAsset } from '../../generated/prisma/client.js';
import { fail } from '../common/errors.js';
import { audit } from '../common/business.js';
import { hash } from '../common/idempotency.service.js';
export async function sanitizeImage(buffer:Buffer):Promise<{buffer:Buffer;mimeType:string}>{
 if(buffer.length>5242880)fail(413,'FILE_TOO_LARGE');
 try{
  const image=sharp(buffer,{limitInputPixels:40000000,animated:false,failOn:'warning'}),m=await image.metadata();
  if(!['jpeg','png','webp'].includes(m.format??'')||(m.pages??1)>1)fail(415,'UNSUPPORTED_MEDIA_TYPE');
  const output=await image.rotate().toBuffer();if(output.length>5242880)fail(413,'FILE_TOO_LARGE');
  return {buffer:output,mimeType:'image/'+m.format};
 }catch(e){if(e instanceof Error&&'status' in e)throw e;fail(415,'UNSUPPORTED_MEDIA_TYPE');}
}
export async function normalizeDishImage(input:Buffer) {
 if(input.length>MAX_UPLOAD_BYTES)fail(413,'FILE_TOO_LARGE');
 let clean:Buffer;
  try {
   const image=sharp(input,{limitInputPixels:40000000,animated:false,failOn:'warning'}),meta=await image.metadata();
   if(!['jpeg','png','webp'].includes(meta.format??'')||(meta.pages??1)>1)fail(415,'UNSUPPORTED_MEDIA_TYPE');
   clean=await image.rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
  }catch{fail(415,'UNSUPPORTED_MEDIA_TYPE');}
  if(clean!.length>5242880)fail(413,'FILE_TOO_LARGE');
 return clean!;
}
@Injectable()
export class FileService {
 private secret(){const s=process.env.FILE_SIGNING_KEY;if(!s||Buffer.byteLength(s)<32)throw new Error('FILE_SIGNING_KEY requires 32 bytes');return s;}
 private signature(familyId:string,id:string,expires:string){return createHmac('sha256',this.secret()).update(`${familyId}/${id}/${expires}`).digest('hex');}
 async signedAsset(file:Pick<FileAsset,'id'|'familyId'|'mimeType'|'sizeBytes'|'storageKey'>){
  if(storageDriver()==='cos')return {fileId:file.id,...await assetUrl(file.storageKey),mimeType:file.mimeType,sizeBytes:file.sizeBytes};
  return this.signed(file);
 }
 signed(file:Pick<FileAsset,'id'|'familyId'|'mimeType'|'sizeBytes'>){
  const base=process.env.FILE_PUBLIC_BASE_URL;if(!base)fail(503,'DEPENDENCY_UNAVAILABLE');
  const expires=String(Math.floor(Date.now()/1000)+900),url=new URL(base);
  url.pathname=url.pathname.replace(/\/$/,'')+`/assets/${file.familyId}/${file.id}`;
  url.search=new URLSearchParams({expires,signature:this.signature(file.familyId,file.id,expires)}).toString();
  return {fileId:file.id,url:url.toString(),expiresAt:new Date(Number(expires)*1000).toISOString(),mimeType:file.mimeType,sizeBytes:file.sizeBytes};
 }
 async image(tx:TransactionClient,familyId:string,id:string|null){if(!id)return null;const f=await tx.fileAsset.findUnique({where:{familyId_id:{familyId,id}}});if(!f)fail(404,'NOT_FOUND');const {fileId,url,expiresAt}=await this.signedAsset(f);return {fileId,url,expiresAt};}
 async initiate(ctx:RequestContext,sizeBytes:number) {
  if(storageDriver()!=='cos')fail(503,'DEPENDENCY_UNAVAILABLE');
  if(!Number.isSafeInteger(sizeBytes)||sizeBytes<1||sizeBytes>MAX_UPLOAD_BYTES)fail(413,'FILE_TOO_LARGE');
  const id=randomUUID(),result=await createDirectUpload(id,sizeBytes);
  return {url:result.url,formData:result.formData,expiresAt:new Date(result.expires*1000).toISOString(),
   ticket:encodeTicket({id,familyId:ctx.familyId!,userId:ctx.userId,sizeBytes,expires:result.expires},this.secret())};
 }
 async complete(tx:TransactionClient,ctx:RequestContext,ticket:string) {
  const claim=decodeTicket(ticket,this.secret(),ctx.familyId!,ctx.userId);
  // Runtime holds the family write lock; the ticket UUID also makes new-key retries safe.
  const previous=await tx.fileAsset.findUnique({where:{id:claim.id}});
  if(previous){if(previous.familyId!==ctx.familyId||previous.uploaderMemberId!==ctx.memberId)fail(403,'FORBIDDEN');return this.signedAsset(previous);}
  let input:Buffer;try{input=await readPendingUpload(claim.id,claim.sizeBytes);}catch{fail(400,'VALIDATION_ERROR');}
  const clean=await normalizeDishImage(input!);
  const storageKey=randomUUID();await putAsset(storageKey,clean!,'image/jpeg');
  const file=await tx.fileAsset.create({data:{id:claim.id,familyId:ctx.familyId!,uploaderMemberId:ctx.memberId!,storageKey,mimeType:'image/jpeg',sizeBytes:clean!.length,sha256:hash(clean!)}});
  await audit(tx,ctx,'FILE_UPLOAD',file.id);
  // Pending raw objects expire via a bucket lifecycle rule. Never delete before DB commit.
  return this.signedAsset(file);
 }
 async upload(tx:TransactionClient,ctx:RequestContext,input:Buffer){
  const clean=await sanitizeImage(input);const storageKey=randomUUID();
  // An aborted DB transaction can leave an unbound file; cleanup is an explicit maintenance task.
  await putAsset(storageKey,clean.buffer,clean.mimeType);
  const f=await tx.fileAsset.create({data:{familyId:ctx.familyId!,uploaderMemberId:ctx.memberId!,storageKey,mimeType:clean.mimeType,sizeBytes:clean.buffer.length,sha256:hash(clean.buffer)}});
  await audit(tx,ctx,'FILE_UPLOAD',f.id);return this.signedAsset(f);
 }
 async get(tx:TransactionClient,ctx:RequestContext,id:string){
  const f=await tx.fileAsset.findUnique({where:{familyId_id:{familyId:ctx.familyId!,id}}});if(!f)fail(404,'NOT_FOUND');
  if(ctx.role!=='ADMIN'){
   const date=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
   const linked=await tx.dish.findFirst({where:{familyId:ctx.familyId,imageFileId:id,deletedAt:null,isAvailable:true,OR:[{kind:'PERMANENT'},{kind:'TEMPORARY',originSession:{serviceDate:new Date(date)}}]}});
   if(!linked)fail(404,'NOT_FOUND');
  }
  return this.signedAsset(f);
 }
 async read(tx:TransactionClient,familyId:string,id:string,expires:string,signature:string){
  if(!/^[0-9]{10,13}$/.test(expires)||!Number.isSafeInteger(Number(expires))||Number(expires)<=Date.now()/1000||Number(expires)>Date.now()/1000+900||!/^\w{64}$/.test(signature))fail(403,'FORBIDDEN');
  const expected=this.signature(familyId,id,expires),actual=Buffer.from(signature);if(actual.length!==64||!timingSafeEqual(Buffer.from(expected),actual))fail(403,'FORBIDDEN');
  if(familyId==='_avatars'){
   if(!/^[a-f0-9-]{36}$/.test(id)||!await tx.user.findFirst({where:{avatarKey:id},select:{id:true}}))fail(404,'NOT_FOUND');
   try{return {buffer:await readAsset(id),mimeType:'image/jpeg'};}catch{fail(503,'DEPENDENCY_UNAVAILABLE');}
  }
  const f=await tx.fileAsset.findUnique({where:{familyId_id:{familyId,id}}});if(!f||!/^[a-f0-9-]{36}$/.test(f.storageKey))fail(404,'NOT_FOUND');
  try{return {buffer:await readAsset(f.storageKey),mimeType:f.mimeType};}catch{fail(503,'DEPENDENCY_UNAVAILABLE');}
 }
}
