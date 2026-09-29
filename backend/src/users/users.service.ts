import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { TransactionClient } from '../database/prisma.service.js';
import { text } from '../common/business.js';
import { sanitizeImage } from '../file/file.service.js';
import { putAsset } from '../file/storage.js';
import { profile } from './profile.js';
@Injectable()
export class UsersService {
 async get(tx:TransactionClient,userId:string){return profile(await tx.user.findUniqueOrThrow({where:{id:userId}}));}
 async update(tx:TransactionClient,userId:string,displayName:string){return profile(await tx.user.update({where:{id:userId},data:{displayName:text(displayName)}}));}
 async avatar(tx:TransactionClient,userId:string,input:Buffer){
  const clean=await sanitizeImage(input);
  const buffer=await sharp(clean.buffer).resize(256,256,{fit:'cover',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();
  const avatarKey=randomUUID();
  await putAsset(avatarKey,buffer,'image/jpeg');
  return profile(await tx.user.update({where:{id:userId},data:{avatarKey}}));
 }
}
