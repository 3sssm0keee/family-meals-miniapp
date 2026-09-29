import { profile } from '../users/profile.js';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service.js';
import { fail } from '../common/errors.js';
@Injectable()
export class AuthService {
 private readonly jwt=new JwtService();
 constructor(private readonly db:PrismaService){}
 private secret(){const v=process.env.JWT_SECRET;if(!v||Buffer.byteLength(v)<32)throw new Error('JWT_SECRET must contain at least 32 bytes');return v;}
 async verify(header:unknown):Promise<string>{
  if(typeof header!=='string'||!/^Bearer [^ ]+$/.test(header))fail(401,'UNAUTHENTICATED');
  try{const p=await this.jwt.verifyAsync(header.slice(7),{secret:this.secret(),algorithms:['HS256']});if(typeof p.sub!=='string'||!Number.isInteger(p.exp))fail(401,'UNAUTHENTICATED');return p.sub;}catch{fail(401,'UNAUTHENTICATED');}
 }
 async login(code:string){
  const appid=process.env.WECHAT_APP_ID, secret=process.env.WECHAT_APP_SECRET;
  if(!appid||!secret)fail(503,'DEPENDENCY_UNAVAILABLE');
  const url=new URL('https://api.weixin.qq.com/sns/jscode2session');url.search=new URLSearchParams({appid,secret,js_code:code,grant_type:'authorization_code'}).toString();
  let data:{openid?:string;errcode?:number};
  try{const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)fail(503,'DEPENDENCY_UNAVAILABLE');data=await response.json();}catch{fail(503,'DEPENDENCY_UNAVAILABLE');}
  if(data.errcode===40029||data.errcode===40163)fail(400,'INVALID_LOGIN_CODE');
  if(data.errcode===45011)fail(429,'RATE_LIMITED');
  if(data.errcode||!data.openid)fail(503,'DEPENDENCY_UNAVAILABLE');
  const user=await this.db.user.upsert({where:{wechatAppId_openid:{wechatAppId:appid,openid:data.openid}},create:{wechatAppId:appid,openid:data.openid,displayName:'家庭成员'},update:{}});
  const now=Math.floor(Date.now()/1000), exp=now+7200;
  const token=await this.jwt.signAsync({sub:user.id,iat:now,exp},{secret:this.secret(),algorithm:'HS256'});
  return {token,expiresAt:new Date(exp*1000).toISOString(),user:profile(user)};
 }
}
