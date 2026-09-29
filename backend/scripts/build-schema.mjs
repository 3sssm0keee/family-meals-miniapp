// Maintainer tool: regenerate schema from this explicit data dictionary mapping.
import { writeFileSync } from 'node:fs';
const enums = {MemberRole:'ADMIN MEMBER GUEST',MemberStatus:'ACTIVE LEFT REMOVED',MealType:'LUNCH DINNER',DishKind:'PERMANENT TEMPORARY',Decision:'UNREVIEWED CONFIRMED CANCELLED',InviteRole:'MEMBER GUEST',SubscriptionResult:'ACCEPT REJECT BAN',NotificationChannel:'WECHAT_SUBSCRIBE',NotificationStatus:'PENDING SENT FAILED SKIPPED UNKNOWN',IdempotencyStatus:'PROCESSING COMPLETED'};
const models = {};
const snake = x => x.replace(/[A-Z]/g, c => '_'+c.toLowerCase());
function model(name,table,fields,unique=[],indexes=[]) {
 models[name]={table,fields:['id String @id @default(uuid()) @db.VarChar(64)',...fields,'createdAt DateTime @default(now()) @db.DateTime(3)','updatedAt DateTime @updatedAt @db.DateTime(3)'],relations:[],unique,indexes};
}
const id = n=>`${n} String @db.VarChar(64)`;
const str=(n,len,def=false)=>`${n} String ${def?'@default("") ':''}@db.VarChar(${len})`;
const date=(n,optional=false)=>`${n} DateTime${optional?'?':''} @db.DateTime(3)`;
const scoped=['familyId'];
model('User','users',[str('wechatAppId',64),str('openid',128),str('displayName',40)],['wechatAppId, openid']);
model('Family','family',[str('name',60)]);
function familyModel(n,t,f,u=[],i=[],parent=true){model(n,t,[id('familyId'),...f],parent?['familyId, id',...u]:u,i);}
model('FamilyMember','family_member',[id('familyId'),id('userId'),'role MemberRole','status MemberStatus @default(ACTIVE)',date('joinedAt')],['familyId, userId','familyId, id'],['familyId, status, role']);
familyModel('MealSession','meal_session',['serviceDate DateTime @db.Date','mealType MealType','reviewVersion Int @default(1)'],['familyId, serviceDate, mealType']);
familyModel('FileAsset','file_asset',[id('uploaderMemberId'),str('storageKey',512),str('mimeType',40),'sizeBytes Int','sha256 String @db.Char(64)'],[],['familyId, createdAt']);
familyModel('Dish','dish',[str('name',60),str('normalizedName',60),'description String @default("") @db.Text','imageFileId String? @db.VarChar(64)','isAvailable Boolean','kind DishKind','originSessionId String? @db.VarChar(64)','version Int @default(1)',date('deletedAt',true),'activeNameKey String? @db.VarChar(160)'],['familyId, activeNameKey'],['familyId, kind, deletedAt, createdAt']);
familyModel('DishVariant','dish_variant',[id('dishId'),str('name',40),str('normalizedName',40),str('portionDescription',200),str('description',500,true),'isAvailable Boolean','version Int @default(1)',date('deletedAt',true),'activeNameKey String? @db.VarChar(40)'],['dishId, activeNameKey']);
familyModel('Cart','cart',[id('sessionId'),id('memberId'),'version Int @default(1)'],['sessionId, memberId']);
familyModel('CartItem','cart_item',[id('cartId'),id('variantId')],['cartId, variantId'],[],false);
familyModel('PersonalMenu','personal_menu',[id('sessionId'),id('memberId'),str('note',500,true),'version Int @default(1)',date('submittedAt')],['sessionId, memberId']);
familyModel('PersonalMenuItem','personal_menu_item',[id('personalMenuId'),id('familyMenuItemId'),id('variantId'),str('dishName',60),str('variantName',40),str('portionDescription',200)],['personalMenuId, variantId'],['familyMenuItemId'],false);
familyModel('FamilyMenuItem','family_menu_item',[id('sessionId'),id('dishId'),id('variantId'),str('dishName',60),str('variantName',40),str('portionDescription',200),'dishKind DishKind','decision Decision @default(UNREVIEWED)','plannedQuantity Decimal? @db.Decimal(4, 1)',str('reason',200,true),'demandVersion Int @default(1)','reviewedDemandVersion Int @default(0)','lastReviewedParticipantCount Int @default(0)'],['sessionId, variantId']);
familyModel('ReviewBatch','review_batch',[id('sessionId'),id('actorMemberId'),'fromVersion Int','toVersion Int','snapshot Json'],['sessionId, toVersion']);
familyModel('MenuOperation','menu_operation',['sessionId String? @db.VarChar(64)',id('actorMemberId'),str('actorName',40),str('action',40),id('resourceId'),str('reason',200,true),str('summary',500,true),'beforeValue Json?','afterValue Json?'],[],['familyId, createdAt, id','sessionId, createdAt'],false);
familyModel('Invite','invite',[id('creatorMemberId'),'codeHash String @unique @db.Char(64)','role InviteRole',date('expiresAt'),date('revokedAt',true)],[],['familyId, createdAt']);
familyModel('InviteRedemption','invite_redemption',[id('inviteId'),id('userId'),id('memberId'),date('redeemedAt')],['inviteId, userId'],[],false);
familyModel('SubscriptionEvent','subscription_event',[id('memberId'),str('templateId',200),'result SubscriptionResult',date('recordedAt')],[],['familyId, memberId, recordedAt'],false);
familyModel('Notification','notification',[id('batchId'),id('memberId'),'channel NotificationChannel','status NotificationStatus','reasonCode String? @db.VarChar(40)','attemptCount Int @default(0)',date('nextAttemptAt',true),date('sentAt',true),'providerMessageId String? @db.VarChar(200)'],['batchId, memberId, channel'],['status, nextAttemptAt'],false);
model('IdempotencyRecord','idempotency_record',[id('userId'),'familyId String? @db.VarChar(64)','scopeHash String @db.Char(64)',str('key',128),'requestHash String @db.Char(64)','status IdempotencyStatus','httpStatus Int?','responseCiphertext Bytes? @db.MediumBlob',date('expiresAt')],['userId, scopeHash, key'],['expiresAt']);
function rel(child,parent,field,optional=false,tenant=true,name=field.replace(/Id$/,'')){
 const key=child+'_'+name;
 models[child].relations.push(`${name} ${parent}${optional?'?':''} @relation("${key}", fields: [${tenant?'familyId, ':''}${field}], references: [${tenant?'familyId, ':''}id], onDelete: Restrict, onUpdate: Restrict)`);
 models[parent].relations.push(`${child[0].toLowerCase()+child.slice(1)}_${name} ${child}[] @relation("${key}")`);
}
for(const [n,m] of Object.entries(models)) if(m.fields.some(f=>f.startsWith('familyId '))) rel(n,'Family','familyId',n==='IdempotencyRecord',false,'family');
rel('FamilyMember','User','userId',false,false,'user');rel('IdempotencyRecord','User','userId',false,false,'user');rel('InviteRedemption','User','userId',false,false,'user');
for(const [c,p,f,o] of [['FileAsset','FamilyMember','uploaderMemberId'],['Dish','FileAsset','imageFileId',true],['Dish','MealSession','originSessionId',true],['DishVariant','Dish','dishId'],['Cart','MealSession','sessionId'],['Cart','FamilyMember','memberId'],['CartItem','Cart','cartId'],['CartItem','DishVariant','variantId'],['PersonalMenu','MealSession','sessionId'],['PersonalMenu','FamilyMember','memberId'],['PersonalMenuItem','PersonalMenu','personalMenuId'],['PersonalMenuItem','FamilyMenuItem','familyMenuItemId'],['PersonalMenuItem','DishVariant','variantId'],['FamilyMenuItem','MealSession','sessionId'],['FamilyMenuItem','Dish','dishId'],['FamilyMenuItem','DishVariant','variantId'],['ReviewBatch','MealSession','sessionId'],['ReviewBatch','FamilyMember','actorMemberId'],['MenuOperation','MealSession','sessionId',true],['MenuOperation','FamilyMember','actorMemberId'],['Invite','FamilyMember','creatorMemberId'],['InviteRedemption','Invite','inviteId'],['InviteRedemption','FamilyMember','memberId'],['SubscriptionEvent','FamilyMember','memberId'],['Notification','ReviewBatch','batchId'],['Notification','FamilyMember','memberId']]) rel(c,p,f,o);
let out='generator client {\n  provider = "prisma-client"\n  output = "../generated/prisma"\n}\n\ndatasource db {\n  provider = "mysql"\n}\n\n';
for(const [n,v] of Object.entries(enums)) out+=`enum ${n} {\n  ${v.split(' ').join('\n  ')}\n}\n\n`;
for(const [n,m] of Object.entries(models)) out+=`model ${n} {\n`+m.fields.map(f=>{const n=f.split(' ')[0];return '  '+f+(snake(n)!==n?` @map("${snake(n)}")`:'');}).join('\n')+'\n'+m.relations.map(x=>'  '+x).join('\n')+'\n'+m.unique.map(x=>`  @@unique([${x}])\n`).join('')+m.indexes.map(x=>`  @@index([${x}])\n`).join('')+`  @@map("${m.table}")\n}\n\n`;
// Match Prisma's introspection of the MySQL 8 UTF-8 TEXT expression default.
out=out.replace('description String @default("") @db.Text','description String @default(dbgenerated('+JSON.stringify("(_utf8mb4\\'\\')")+')) @db.Text');
writeFileSync(new URL('../prisma/schema.prisma',import.meta.url),out.trimEnd()+'\n','utf8');
