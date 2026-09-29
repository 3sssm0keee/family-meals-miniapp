import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './database/prisma.service.js';
@Controller('health')
export class HealthController {
 constructor(private readonly db:PrismaService){}
 @Get()
 async health(){
  try {await this.db.$queryRaw`SELECT 1`;return {status:'ok',database:'up'};}
  catch {throw new ServiceUnavailableException();}
 }
}
