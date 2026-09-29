import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { PrismaService } from '../src/database/prisma.service.js';
import { spawnSync } from 'node:child_process';
const env=parse(readFileSync(process.argv[2]));const url=new URL(env.DATABASE_URL);
if(url.hostname!=='127.0.0.1'||url.port!=='3317'||url.pathname!=='/family_meals_base_test')throw new Error('Wrong database');
process.env.DATABASE_URL=env.DATABASE_URL;const db=new PrismaService();
try{
 const tables=await db.$queryRaw<Array<{TABLE_NAME:string}>>`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`;
 const actual=tables.map(t=>t.TABLE_NAME).sort().join(',');
 if(actual!=='_prisma_migrations,family,family_member,file_asset,meal_session,users')throw new Error('Recovery requires exactly the inspected partial initial migration');
 const sql=readFileSync('prisma/migrations/20260911060000_initial/migration.sql','utf8');
 const start=sql.indexOf('CREATE TABLE `dish`');if(start<0)throw new Error('Missing recovery boundary');
 const commands=sql.slice(start).split(';').map(s=>s.replace(/--[^\n]*/g,'').trim()).filter(Boolean);
 for(const command of commands)await db.$executeRawUnsafe(command); // Only this reviewed, local immutable DDL file.
 console.log('Applied remaining initial migration DDL without deleting existing tables');
}finally{await db.$disconnect();}
const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','resolve','--applied','20260911060000_initial'],{env:process.env,stdio:'inherit'});
process.exitCode=result.status??1;
