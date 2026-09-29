import { RequestMethod, type INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ApiExceptionFilter } from './errors.js';
export async function configureApp(app:INestApplication){
 if(process.env.DEPLOY_TARGET==='wechat-cloudrun'){
  app.use((req:{method:string;requestId?:string;route?:{path?:string}},res:{statusCode:number;once(event:string,fn:()=>void):void},next:()=>void)=>{
   const started=Date.now();req.requestId=randomUUID();
   res.once('finish',()=>console.log(JSON.stringify({event:'http',method:req.method,route:req.route?.path??'unmatched',status:res.statusCode,durationMs:Date.now()-started,requestId:req.requestId})));
   next();
  });
 }
 app.setGlobalPrefix('api/v1',{exclude:[{path:'assets/:familyId/:id',method:RequestMethod.GET}]});
 app.useGlobalFilters(new ApiExceptionFilter());
 await app.init();
 // Nest 12/Express leaves unmatched routes to Express's HTML final handler.
 // Register after routes so all missing endpoints retain the API envelope.
 app.use((req:{requestId?:string},res:{status(n:number):{json(v:unknown):void}})=>res.status(404).json({error:{code:'NOT_FOUND',message:'NOT_FOUND',details:{}},requestId:req.requestId??randomUUID()}));
}
