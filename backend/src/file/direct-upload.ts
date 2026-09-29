import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { fail } from '../common/errors.js';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export interface UploadClaim { id:string; familyId:string; userId:string; sizeBytes:number; expires:number }
export function encodeTicket(claim:UploadClaim, secret:string) {
 const body=Buffer.from(JSON.stringify(claim)).toString('base64url');
 return body+'.'+createHmac('sha256',secret).update(body).digest('hex');
}
export function decodeTicket(ticket:string,secret:string,familyId:string,userId:string,now=Date.now()):UploadClaim {
 const [body,mac,...extra]=ticket.split('.');
 if(extra.length||!body||!mac||!/^[a-f0-9]{64}$/.test(mac))fail(403,'FORBIDDEN');
 const expected=createHmac('sha256',secret).update(body).digest();
 if(!timingSafeEqual(expected,Buffer.from(mac,'hex')))fail(403,'FORBIDDEN');
 let claim:UploadClaim;try{claim=JSON.parse(Buffer.from(body,'base64url').toString());}catch{fail(403,'FORBIDDEN');}
 if(!claim!||claim.familyId!==familyId||claim.userId!==userId||!Number.isFinite(claim.expires)||claim.expires*1000<=now||
   !/^[a-f0-9-]{36}$/.test(claim.id)||!Number.isSafeInteger(claim.sizeBytes)||claim.sizeBytes<1||claim.sizeBytes>MAX_UPLOAD_BYTES)fail(403,'FORBIDDEN');
 return claim;
}

// COS POST Object: the signed policy restricts key, exact byte count and lifetime.
// Never return SecretKey (including managed CloudRun temporary SecretKey).
export function postPolicy(input:{bucket:string;region:string;key:string;sizeBytes:number;expires:number;secretId:string;secretKey:string;token?:string},now=Math.floor(Date.now()/1000)) {
 const keyTime=`${now-30};${input.expires}`;
 const fields:Record<string,string>={key:input.key,'q-sign-algorithm':'sha1','q-ak':input.secretId,'q-key-time':keyTime,
  success_action_status:'204',acl:'private'};
 if(input.token)fields['x-cos-security-token']=input.token;
 const policy=JSON.stringify({expiration:new Date(input.expires*1000).toISOString(),conditions:[
  {bucket:input.bucket},...Object.entries(fields).map(([k,v])=>({[k==='q-key-time'?'q-sign-time':k]:v})),['content-length-range',input.sizeBytes,input.sizeBytes]
 ]});
 const signKey=createHmac('sha1',input.secretKey).update(keyTime).digest('hex');
 fields.policy=Buffer.from(policy).toString('base64');
 fields['q-signature']=createHmac('sha1',signKey).update(createHash('sha1').update(policy).digest('hex')).digest('hex');
 return {url:`https://${input.bucket}.cos.${input.region}.myqcloud.com/`,formData:fields};
}
