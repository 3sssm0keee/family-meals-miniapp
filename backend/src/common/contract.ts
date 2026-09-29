import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './errors.js';
type Schema = { $ref?:string; type?:string; properties?:Record<string,Schema>; required?:string[]; additionalProperties?:boolean; minProperties?:number; items?:Schema; minItems?:number; maxItems?:number; uniqueItems?:boolean; minLength?:number; maxLength?:number; minimum?:number; maximum?:number; multipleOf?:number; enum?:unknown[]; const?:unknown; pattern?:string; format?:string; anyOf?:Schema[]; oneOf?:Schema[]; default?:unknown };
export interface Operation {operationId:string; 'x-required-role':string; parameters:Array<{name:string;in:string;required:boolean;schema:Schema}>; requestBody?:{content:Record<string,{schema:Schema}>};responses:Record<string,{content:Record<string,{schema:Schema}>}>}
function loadContract(){
 let dir=dirname(fileURLToPath(import.meta.url));
 while(true){const path=resolve(dir,'docs/contracts/openapi-v1.json');if(existsSync(path)) return JSON.parse(readFileSync(path,'utf8')) as {components:{schemas:Record<string,Schema>};paths:Record<string,Record<string,Operation>>}; const up=dirname(dir);if(up===dir)throw new Error('API contract not found');dir=up;}
}
export const contract=loadContract();
export const operations=new Map(Object.entries(contract.paths).flatMap(([path,methods])=>Object.entries(methods).map(([method,spec])=>[spec.operationId,{path,method,spec}] as const)));
export function validate(schema:Schema,value:unknown,path='body'): void {
 const invalid=()=>fail(400,'VALIDATION_ERROR',{fieldErrors:[{field:path.slice(0,200),message:'字段格式或取值不符合契约'}]});
 if(schema.$ref)return validate(contract.components.schemas[schema.$ref.split('/').at(-1)!],value,path);
 const matches=(s:Schema)=>{try{validate(s,value,path);return true;}catch{return false;}};
 if(schema.anyOf&&!schema.anyOf.some(matches))invalid();
 if(schema.oneOf&&schema.oneOf.filter(matches).length!==1)invalid();
 if(schema.enum&&!schema.enum.includes(value))invalid();
 if('const' in schema&&schema.const!==value)invalid();
 switch(schema.type){
 case 'null':if(value!==null)invalid();break;
 case 'object':{
  if(!value||typeof value!=='object'||Array.isArray(value))invalid();const o=value as Record<string,unknown>;
  for(const k of schema.required??[])if(!(k in o))invalid();
  if(Object.keys(o).length<(schema.minProperties??0))invalid();
  for(const [k,v] of Object.entries(o)){if(!schema.properties?.[k]){if(schema.additionalProperties===false)invalid();}else validate(schema.properties[k],v,path+'.'+k);}break;
 }
 case 'array':{
  if(!Array.isArray(value))invalid();const a=value as unknown[];
  if(a.length<(schema.minItems??0)||a.length>(schema.maxItems??Infinity))invalid();
  if(schema.uniqueItems&&new Set(a.map(v=>JSON.stringify(v))).size!==a.length)invalid();a.forEach((v,i)=>validate(schema.items!,v,path+'.'+i));break;
 }
 case 'string':{
  if(typeof value!=='string')invalid();const s=value as string,n=[...s].length;
  if(n<(schema.minLength??0)||n>(schema.maxLength??Infinity)||(schema.pattern&&!new RegExp(schema.pattern).test(s)))invalid();
  if(schema.format==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s))invalid();
  if(schema.format==='date-time'&&!Number.isFinite(Date.parse(s)))invalid();break;
 }
 case 'integer':case 'number':if(typeof value!=='number'||!Number.isFinite(value)||(schema.type==='integer'&&!Number.isSafeInteger(value))||value<(schema.minimum??-Infinity)||value>(schema.maximum??Infinity)||(schema.multipleOf!==undefined&&Math.abs(value/schema.multipleOf-Math.round(value/schema.multipleOf))>1e-8))invalid();break;
 case 'boolean':if(typeof value!=='boolean')invalid();break;
 }
}
export interface ApiRequest {headers:Record<string,string|string[]|undefined>;params:Record<string,string>;query:Record<string,unknown>;body?:unknown;requestId?:string;method:string;path:string;file?:{buffer:Buffer;size:number}}
export function validateRequest(op:Operation,req:ApiRequest){
 const query:Record<string,unknown>={};
 for(const p of op.parameters){
  let v=p.in==='path'?req.params[p.name]:p.in==='query'?req.query[p.name]:req.headers[p.name.toLowerCase()];
  if(v===undefined){if(p.required)fail(400,'VALIDATION_ERROR');v=p.schema.default;}
  if(v===undefined)continue;
  if(p.in==='query'&&typeof v==='string'){
    if(p.schema.type==='integer'&&/^\d+$/.test(v))v=Number(v);
    if(p.schema.type==='boolean'&&(v==='true'||v==='false'))v=v==='true';
  }
  validate(p.schema,v,p.in+'.'+p.name);if(p.in==='query')query[p.name]=v;
 }
 if(Object.keys(req.query).some(k=>!op.parameters.some(p=>p.in==='query'&&p.name===k)))fail(400,'VALIDATION_ERROR');
 const schema=op.requestBody?.content['application/json']?.schema;
 if(schema)validate(schema,req.body);
 else if(req.body&&Object.keys(req.body).length)fail(400,'VALIDATION_ERROR');
 return query;
}
