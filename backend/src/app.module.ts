import { Module } from '@nestjs/common';
import { BaseModule } from './base.module.js';
import { MenuController } from './menu/menu.controller.js';
import { MenuService } from './menu/menu.service.js';
import { HealthController } from './health.controller.js';
@Module({imports:[BaseModule],controllers:[MenuController,HealthController],providers:[MenuService]})
export class AppModule {}
