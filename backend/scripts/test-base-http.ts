import 'reflect-metadata';
import assert from 'node:assert/strict';
import { NestFactory } from '@nestjs/core';
import { BaseModule } from '../src/base.module.js';
import { configureApp } from '../src/common/configure-app.js';
// Run compiled JS: TypeScript emits the Nest dependency-injection metadata.
process.env.DATABASE_URL='mysql://offline:unused@127.0.0.1:1/offline';
process.env.JWT_SECRET='offline-http-check-secret-32-bytes-long';
delete process.env.WECHAT_APP_ID;delete process.env.WECHAT_APP_SECRET;
const app=await NestFactory.create(BaseModule,{logger:false});
await configureApp(app);
try{
 await app.listen(0,'127.0.0.1');const url=await app.getUrl();
 for(const [path,options,status,code] of [
  ['/api/v1/me',{},401,'UNAUTHENTICATED'],
  ['/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'x'})},503,'DEPENDENCY_UNAVAILABLE'],
  ['/api/v1/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:'x',role:'ADMIN'})},400,'VALIDATION_ERROR'],
  ['/api/v1/missing',{},404,'NOT_FOUND'],
  ['/assets/f/id?expires=0&signature=bad',{},403,'FORBIDDEN'],
 ] as const){const response=await fetch(url+path,options);const raw=await response.text();console.log(path,response.status,raw.slice(0,350));const body=JSON.parse(raw);assert.equal(response.status,status,path);assert.equal(body.error.code,code,path);assert.ok(body.requestId);}
 console.log('PASS 5 real HTTP negative paths; no database connection; '+url);
}finally{await app.close();}
