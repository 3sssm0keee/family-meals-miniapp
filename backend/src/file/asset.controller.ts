import { Controller, Get, Req, Res } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { FileService } from './file.service.js';
import type { ApiRequest } from '../common/contract.js';
@Controller('assets')
export class AssetController {
 constructor(private readonly db:PrismaService,private readonly files:FileService){}
 @Get(':familyId/:id')
 async get(@Req() req:ApiRequest,@Res() res:{setHeader(k:string,v:string):void;send(b:Buffer):unknown}){
  const f=await this.files.read(this.db,req.params.familyId,req.params.id,String(req.query.expires??''),String(req.query.signature??''));
  res.setHeader('Content-Type',f.mimeType);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','private, no-store');return res.send(f.buffer);
 }
}
