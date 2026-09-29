import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {UsersService} from '../src/users/users.service.js';
import {FileService} from '../src/file/file.service.js';
import {AuthService} from '../src/auth/auth.service.js';
import {profile} from '../src/users/profile.js';
import {operations,validate} from '../src/common/contract.js';
test('avatar upload persists only on authenticated user, signs access and survives profile reload',async()=>{
 const root=await mkdtemp(join(tmpdir(),'meal-avatar-test-'));
 process.env.FILE_STORAGE_ROOT=root;process.env.FILE_STORAGE_DRIVER='local';delete process.env.DEPLOY_TARGET;
 process.env.FILE_SIGNING_KEY='s'.repeat(48);process.env.FILE_PUBLIC_BASE_URL='https://example.test';
 const row={id:'self',displayName:'本人',avatarKey:null as string|null};let updates=0;
 const tx:any={user:{update:async({where,data}:any)=>{assert.equal(where.id,'self');updates++;Object.assign(row,data);return row;},findUniqueOrThrow:async()=>row,findFirst:async({where}:any)=>where.avatarKey===row.avatarKey?{id:row.id}:null}};
 try {
  const service=new UsersService();const bytes=await sharp({create:{width:400,height:300,channels:3,background:'#eac'}}).png().toBuffer();
  const result=await service.avatar(tx,'self',bytes);assert.equal(updates,1);assert.ok(result.avatar);assert.ok(row.avatarKey);
  assert.equal((await service.get(tx,'self')).avatar!.fileId,result.avatar.fileId);
  validate(operations.get('uploadAvatar')!.spec.responses['200'].content['application/json'].schema,{data:result,requestId:'test'});
  const u=new URL(result.avatar.url),files=new FileService();
  const loaded=await files.read(tx,'_avatars',result.avatar.fileId,u.searchParams.get('expires')!,u.searchParams.get('signature')!);
  const meta=await sharp(loaded.buffer).metadata();assert.equal(meta.width,256);assert.equal(meta.height,256);assert.equal(meta.format,'jpeg');
  await assert.rejects(files.read(tx,'_avatars',result.avatar.fileId,u.searchParams.get('expires')!,'0'.repeat(64)),(e:any)=>e.code==='FORBIDDEN');
  await assert.rejects(service.avatar(tx,'self',Buffer.from('invalid image')),(e:any)=>e.code==='UNSUPPORTED_MEDIA_TYPE');assert.equal(updates,1);
  const previous=result.avatar;await service.avatar(tx,'self',bytes);
  await assert.rejects(files.read(tx,'_avatars',previous.fileId,u.searchParams.get('expires')!,u.searchParams.get('signature')!),(e:any)=>e.code==='NOT_FOUND');
 } finally {await rm(root,{recursive:true,force:true});}
});
test('WeChat account key remains appid/openid; profile does not disclose either or secret',async()=>{
 process.env.WECHAT_APP_ID='test-app';process.env.WECHAT_APP_SECRET='test-secret';process.env.JWT_SECRET='j'.repeat(48);
 const original=globalThis.fetch;let openid='wechat-a';const rows=new Map();
 globalThis.fetch=async()=>({ok:true,json:async()=>({openid})}) as any;
 const db:any={user:{upsert:async({where,create}:any)=>{assert.deepEqual(where.wechatAppId_openid,{wechatAppId:'test-app',openid});const key=JSON.stringify(where);if(!rows.has(key))rows.set(key,{id:'user-'+rows.size,...create,avatarKey:null});return rows.get(key);}}};
 try {const auth=new AuthService(db);const first=await auth.login('a');const again=await auth.login('b');assert.equal(first.user.id,again.user.id);openid='wechat-b';const other=await auth.login('c');assert.notEqual(other.user.id,first.user.id);assert.deepEqual(Object.keys(first.user).sort(),['avatar','displayName','id']);assert.equal(profile({id:'old',displayName:'old'}).avatar,null);}finally{globalThis.fetch=original;}
});
