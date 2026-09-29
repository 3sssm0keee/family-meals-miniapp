import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parse } from 'dotenv';
import { PrismaService } from '../src/database/prisma.service.js';

const env=parse(readFileSync(process.argv[2]));
const url=new URL(env.DATABASE_URL);
if(url.hostname!=='127.0.0.1'||url.port!=='3317'||url.pathname!=='/family_meals_migration_clean')throw new Error('Refusing non-clean-migration target');
process.env.DATABASE_URL=env.DATABASE_URL;
const db=new PrismaService();
function prisma(args:string[]){
 const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js',...args],{env:process.env,stdio:'inherit'});
 assert.equal(result.status,0,'Prisma '+args.join(' '));
}
try{
 if(!process.argv.includes('--verify-only')){
  const before=await db.$queryRaw<Array<{TABLE_NAME:string}>>`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`;
  assert.equal(before.length,0,'Must start with a completely empty database');
  console.log('PASS preflight: zero tables');
  prisma(['migrate','deploy']);
 }
 const tables=await db.$queryRaw<Array<{TABLE_NAME:string;TABLE_COLLATION:string}>>`SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`;
 const expected=['users','family','family_member','meal_session','file_asset','dish','dish_variant','cart','cart_item','personal_menu','personal_menu_item','family_menu_item','review_batch','menu_operation','invite','invite_redemption','subscription_event','notification','idempotency_record'];
 assert.deepEqual(tables.filter(t=>t.TABLE_NAME!=='_prisma_migrations').map(t=>t.TABLE_NAME).sort(),expected.sort());
 assert.equal(tables.length,20);
 assert.ok(tables.filter(t=>t.TABLE_NAME!=='_prisma_migrations').every(t=>t.TABLE_COLLATION==='utf8mb4_bin'));
 const migrations=await db.$queryRaw<Array<{migration_name:string;finished_at:Date|null;rolled_back_at:Date|null;applied_steps_count:bigint;checksum:string}>>`SELECT migration_name, finished_at, rolled_back_at, applied_steps_count, checksum FROM _prisma_migrations`;
 assert.equal(migrations.length,1);
 const migration=migrations[0];
 assert.equal(migration.migration_name,'20260911060000_initial');
 assert.ok(migration.finished_at);assert.equal(migration.rolled_back_at,null);assert.equal(Number(migration.applied_steps_count),1);
 const checksum=createHash('sha256').update(readFileSync('prisma/migrations/20260911060000_initial/migration.sql')).digest('hex');
 assert.equal(migration.checksum,checksum);
 console.log(JSON.stringify({businessTables:19,migrationTable:true,collation:'utf8mb4_bin',migration: migration.migration_name,finishedAt:migration.finished_at,appliedSteps:1,checksum},null,2));
 prisma(['migrate','status']);
 prisma(['migrate','diff','--from-config-datasource','--to-schema','prisma/schema.prisma','--exit-code']);
 console.log('PASS clean deploy, successful migration record, status and zero schema difference');
}finally{await db.$disconnect();}
