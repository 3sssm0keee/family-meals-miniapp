import { postPolicy, MAX_UPLOAD_BYTES } from './direct-upload.js';
import COS from 'cos-nodejs-sdk-v5';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function location(key: string) {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid asset storage key');
  return {
    Bucket: required('COS_BUCKET'),
    Region: required('COS_REGION'),
    Key: `family-meals/assets/${key}`,
  };
}

let managedCredentials: {secretId:string;secretKey:string;token:string;expires:number}|undefined;
let temporaryClient: { value: COS; expires: number } | undefined;
async function client() {
  if (process.env.COS_AUTH_MODE === 'wechat-cloudrun') {
    if (process.env.DEPLOY_TARGET !== 'wechat-cloudrun') throw new Error('Managed COS authentication requires Cloudrun');
    if (temporaryClient && temporaryClient.expires > Date.now() / 1000 + 120) return temporaryClient.value;
    const response = await fetch('http://api.weixin.qq.com/_/cos/getauth', {
      signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (!response.ok) throw new Error('Managed COS authentication unavailable');
    const info = await response.json() as Record<string, unknown>;
    const expires = Number(info.ExpiredTime);
    if (typeof info.TmpSecretId !== 'string' || !info.TmpSecretId ||
        typeof info.TmpSecretKey !== 'string' || !info.TmpSecretKey ||
        typeof info.Token !== 'string' || !info.Token || !Number.isFinite(expires) || expires <= Date.now() / 1000 + 120) {
      throw new Error('Invalid managed COS authentication response');
    }
    const value = new COS({ SecretId: info.TmpSecretId, SecretKey: info.TmpSecretKey,
      SecurityToken: info.Token, Protocol: 'https:', Timeout: 10000 });
    managedCredentials={secretId:info.TmpSecretId,secretKey:info.TmpSecretKey,token:info.Token,expires};
    temporaryClient = {value, expires};
    return value;
  }
  return new COS({
    SecretId: required('COS_SECRET_ID'),
    SecretKey: required('COS_SECRET_KEY'),
    SecurityToken: process.env.COS_SECURITY_TOKEN,
    Protocol: 'https:',
    Timeout: 10000,
  });
}

export function storageDriver() {
  const driver = process.env.FILE_STORAGE_DRIVER || 'local';
  if (!['local', 'cos'].includes(driver)) throw new Error('Unknown FILE_STORAGE_DRIVER');
  if (process.env.DEPLOY_TARGET === 'wechat-cloudrun' && driver !== 'cos') {
    throw new Error('Cloudrun requires persistent COS storage');
  }
  return driver;
}

export async function putAsset(key: string, buffer: Buffer, mimeType: string) {
  if (storageDriver() === 'cos') {
    await (await client()).putObject({ ...location(key), Body: buffer, ContentType: mimeType, ACL: 'private' });
    return;
  }
  const root = resolve(required('FILE_STORAGE_ROOT'));
  await mkdir(root, { recursive: true });
  await writeFile(resolve(root, key), buffer, { flag: 'wx' });
}

export async function readAsset(key: string): Promise<Buffer> {
  if (storageDriver() === 'cos') {
    const result = await (await client()).getObject(location(key));
    if (!Buffer.isBuffer(result.Body)) throw new Error('Invalid COS object response');
    return result.Body;
  }
  return readFile(resolve(required('FILE_STORAGE_ROOT'), key));
}

export async function deleteAsset(key: string): Promise<void> {
  if (!/^[a-f0-9-]{36}$/.test(key)) throw new Error('Invalid asset storage key');
  if (storageDriver() === 'cos') {
    await (await client()).deleteObject(location(key));
    return;
  }
  try { await unlink(resolve(required('FILE_STORAGE_ROOT'), key)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}

function pendingLocation(id:string) {
 const base=location(id);return {...base,Key:`family-meals/pending/${id}`};
}
export async function createDirectUpload(id:string,sizeBytes:number) {
 if(storageDriver()!=='cos')throw new Error('Direct upload requires COS');
 await client();
 const c=process.env.COS_AUTH_MODE==='wechat-cloudrun'?managedCredentials!:{secretId:required('COS_SECRET_ID'),secretKey:required('COS_SECRET_KEY'),token:process.env.COS_SECURITY_TOKEN,expires:Math.floor(Date.now()/1000)+600};
 const expires=Math.min(Math.floor(Date.now()/1000)+600,c.expires-30);
 const target=pendingLocation(id);
 return {...postPolicy({bucket:target.Bucket,region:target.Region,key:target.Key,sizeBytes,...c,expires}),expires};
}
export async function readPendingUpload(id:string,sizeBytes:number):Promise<Buffer> {
 const cos=await client(),target=pendingLocation(id);
 const head=await cos.headObject(target);
 if(Number(head.headers?.['content-length'])!==sizeBytes||sizeBytes>MAX_UPLOAD_BYTES)throw new Error('Uploaded size mismatch');
 // Range bounds memory even if an object changes between HEAD and GET.
 const result=await cos.getObject({...target,Range:`bytes=0-${sizeBytes}`});
 if(!Buffer.isBuffer(result.Body)||result.Body.length!==sizeBytes)throw new Error('Uploaded size mismatch');
 return result.Body;
}
export async function assetUrl(key:string) {
 const cos=await client();
 const seconds=process.env.COS_AUTH_MODE==='wechat-cloudrun'?Math.min(900,managedCredentials!.expires-Math.floor(Date.now()/1000)-30):900;
 const url=await new Promise<string>((resolve,reject)=>cos.getObjectUrl({...location(key),Sign:true,Expires:seconds},(err,data)=>err?reject(err):resolve(data.Url)));
 return {url,expiresAt:new Date(Date.now()+seconds*1000).toISOString()};
}
