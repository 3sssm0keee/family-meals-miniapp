import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,createHash,createHmac } from 'node:crypto';
import { encodeTicket,decodeTicket,postPolicy,MAX_UPLOAD_BYTES } from '../src/file/direct-upload.js';
import { FileService,normalizeDishImage } from '../src/file/file.service.js';
import sharp from 'sharp';
import { operations,validateRequest } from '../src/common/contract.js';
const secret='test-only-signing-key-not-a-real-key';
const now=Date.now(),claim={id:randomUUID(),familyId:'familyA',userId:'userA',sizeBytes:7*1024*1024,expires:Math.floor(now/1000)+600};
test('phone-size image is normalized to bounded JPEG without metadata; corrupt input fails',async()=>{
 const input=await sharp({create:{width:4032,height:3024,channels:3,background:'#773311'}}).jpeg().withMetadata({orientation:6}).toBuffer();
 const result=await normalizeDishImage(input),meta=await sharp(result).metadata();
 assert.equal(meta.format,'jpeg');assert.ok(meta.width!<=1600&&meta.height!<=1600);
 assert.equal(meta.orientation,undefined);assert.equal(meta.exif,undefined);
 await assert.rejects(normalizeDishImage(Buffer.from('not an image')));
 await assert.rejects(normalizeDishImage(Buffer.alloc(MAX_UPLOAD_BYTES+1)));
});
test('upload ticket binds user/family, rejects tampering and expiration',()=>{
 const ticket=encodeTicket(claim,secret);
 assert.deepEqual(decodeTicket(ticket,secret,'familyA','userA',now),claim);
 for(const [family,user,time] of [['familyB','userA',now],['familyA','userB',now],['familyA','userA',now+601000]] as const)
  assert.throws(()=>decodeTicket(ticket,secret,family,user,time));
 assert.throws(()=>decodeTicket(ticket+'0',secret,'familyA','userA',now));
 assert.throws(()=>decodeTicket(encodeTicket({...claim,sizeBytes:MAX_UPLOAD_BYTES+1},secret),secret,'familyA','userA',now));
});
test('POST policy constrains exact object/size/private ACL and signs plaintext policy',()=>{
 const result=postPolicy({bucket:'test-123',region:'ap-shanghai',key:'family-meals/pending/test',sizeBytes:claim.sizeBytes,expires:claim.expires,secretId:'test-id',secretKey:secret,token:'test-token'});
 const raw=Buffer.from(result.formData.policy,'base64').toString(),p=JSON.parse(raw);
 assert.ok(p.conditions.some((c:any)=>c.key==='family-meals/pending/test'));
 assert.ok(p.conditions.some((c:any)=>c.acl==='private'));
 assert.ok(p.conditions.some((c:any)=>c['q-sign-time']===result.formData['q-key-time']));
 assert.ok(p.conditions.some((c:any)=>c['x-cos-security-token']==='test-token'));
 assert.deepEqual(p.conditions.find((c:any)=>Array.isArray(c)),['content-length-range',claim.sizeBytes,claim.sizeBytes]);
 const signing=createHmac('sha1',secret).update(result.formData['q-key-time']).digest('hex');
 assert.equal(result.formData['q-signature'],createHmac('sha1',signing).update(createHash('sha1').update(raw).digest('hex')).digest('hex'));
 assert.ok(!JSON.stringify(result).includes(secret));
});
test('new endpoints are ADMIN-only, require idempotency, reject oversized input',()=>{
 for(const id of ['createFileUpload','completeFileUpload']){
  const op=operations.get(id)!;assert.equal(op.spec['x-required-role'],'ADMIN');
  assert.ok(op.spec.parameters.some(p=>p.name==='Idempotency-Key'&&p.required));
 }
 const spec=operations.get('createFileUpload')!.spec;
 assert.throws(()=>validateRequest(spec,{method:'POST',path:'/',params:{familyId:'familyA'},headers:{'idempotency-key':'test-key-123456789'},query:{},body:{sizeBytes:MAX_UPLOAD_BYTES+1}}));
});
test('completion retry returns existing owned asset without reading raw upload; cross-user ticket fails',async()=>{
 process.env.FILE_SIGNING_KEY=secret;process.env.FILE_STORAGE_DRIVER='local';process.env.FILE_PUBLIC_BASE_URL='https://example.invalid/api/v1';
 const service=new FileService();
 const existing={id:claim.id,familyId:claim.familyId,uploaderMemberId:'memberA',storageKey:randomUUID(),mimeType:'image/jpeg',sizeBytes:100};
 const tx={fileAsset:{findUnique:async()=>existing}} as any;
 const ctx={familyId:'familyA',userId:'userA',memberId:'memberA',requestId:'test'};
 assert.equal((await service.complete(tx,ctx,encodeTicket(claim,secret))).fileId,claim.id);
 await assert.rejects(service.complete(tx,{...ctx,userId:'userB'},encodeTicket(claim,secret)));
 await assert.rejects(service.complete(tx,{...ctx,memberId:'memberB'},encodeTicket(claim,secret)));
});
