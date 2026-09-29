import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';
import { BaseController } from './common/base.controller.js';
import { AssetController } from './file/asset.controller.js';
import { UsersService } from './users/users.service.js';
import { FamilyService } from './family/family.service.js';
import { InviteService } from './invite/invite.service.js';
import { DishService } from './dish/dish.service.js';
import { FileService } from './file/file.service.js';
import { CleanupService } from './file/cleanup.service.js';
@Module({imports:[CommonModule],controllers:[BaseController,AssetController],providers:[UsersService,FamilyService,InviteService,DishService,FileService,CleanupService],exports:[DishService,FileService]})
export class BaseModule {}
