import { Injectable } from '@nestjs/common';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { PrismaService, type TransactionClient } from '../database/prisma.service.js';
import type { RequestContext, WriteRequest, WriteResult } from './context.js';
import { fail } from './errors.js';
export function canonical(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
}
export const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export function encryptionKey(): Buffer {
  const key = Buffer.from(process.env.IDEMPOTENCY_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== 32) throw new Error('IDEMPOTENCY_ENCRYPTION_KEY must be 32 bytes encoded as base64');
  return key;
}
export function encrypt(value: unknown, key: Buffer): Buffer {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),data]);
}
export function decrypt(value: Uint8Array, key: Buffer): unknown {
  const b=Buffer.from(value), cipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));
  cipher.setAuthTag(b.subarray(12,28));
  return JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString('utf8'));
}
@Injectable()
export class IdempotencyService {
  constructor(private readonly db: PrismaService) {}
  async execute<T>(ctx: RequestContext, req: WriteRequest, authorize: (tx: TransactionClient, replay: boolean)=>Promise<void>, work: (tx: TransactionClient)=>Promise<WriteResult<T>>): Promise<WriteResult<T>> {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(req.key)) fail(400,'VALIDATION_ERROR');
    const key=encryptionKey();
    const scopeHash=hash(canonical([ctx.familyId??null,req.method.toUpperCase(),req.path]));
    const requestHash=hash(canonical({body:req.body,query:req.query,fileHash:req.fileHash}));
    const where={userId_scopeHash_key:{userId:ctx.userId,scopeHash,key:req.key}};
    const prior=await this.db.idempotencyRecord.findUnique({where});
    if (prior && prior.expiresAt>new Date()) {
      return this.db.transaction(async tx=>{
        await authorize(tx,true);
        if(prior.requestHash!==requestHash) fail(409,'IDEMPOTENCY_CONFLICT');
        if(prior.status!=='COMPLETED'||!prior.responseCiphertext||!prior.httpStatus) fail(409,'REQUEST_IN_PROGRESS');
        return {status:prior.httpStatus,data:decrypt(prior.responseCiphertext,key) as T};
      });
    }
    await this.db.transaction(tx=>authorize(tx,false));
    // Expired entries are removed by exact ID and expiration; never remove a replacement reservation.
    if(prior) await this.db.idempotencyRecord.deleteMany({where:{id:prior.id,expiresAt:{lte:new Date()}}});
    let reservation: {id:string};
    try {
      reservation=await this.db.idempotencyRecord.create({data:{userId:ctx.userId,familyId:ctx.familyId,scopeHash,key:req.key,requestHash,status:'PROCESSING',expiresAt:new Date(Date.now()+86400000)}});
    } catch(error) {
      if((error as {code?:string}).code==='P2002') {
        const winner=await this.db.idempotencyRecord.findUnique({where});
        fail(409,winner?.requestHash!==requestHash?'IDEMPOTENCY_CONFLICT':'REQUEST_IN_PROGRESS');
      }
      throw error;
    }
    try {
      return await this.db.transaction(async tx=>{
        await authorize(tx,false);
        const result=await work(tx);
        await tx.idempotencyRecord.update({where:{id:reservation.id},data:{status:'COMPLETED',httpStatus:result.status,responseCiphertext:new Uint8Array(encrypt(result.data,key)),expiresAt:new Date(Date.now()+86400000)}});
        return result;
      });
    } catch(error) {
      await this.db.idempotencyRecord.deleteMany({where:{id:reservation.id,status:'PROCESSING'}});
      throw error;
    }
  }
}
