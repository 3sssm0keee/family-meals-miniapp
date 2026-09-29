import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { PrismaService } from '../src/database/prisma.service.js';
import { spawnSync } from 'node:child_process';
const env=parse(readFileSync(process.argv[2]));const url=new URL(env.DATABASE_URL);
if(url.hostname!=='127.0.0.1'||url.port!=='3317'||url.pathname!=='/family_meals_base_test')throw new Error('Wrong database');
process.env.DATABASE_URL=env.DATABASE_URL;const db=new PrismaService();
try{console.log(await db.$queryRaw`SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`);}finally{await db.$disconnect();}
const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-config-datasource','--to-schema','prisma/schema.prisma','--exit-code'],{env:process.env,stdio:'inherit'});
if(result.status===2){const r=spawnSync(process.execPath,['node_modules/prisma/build/index.js','db','pull','--print'],{env:process.env,encoding:'utf8'});console.log(r.stdout.split('\n').filter(s=>s.includes('dbgenerated')).join('\n'));}
process.exitCode=result.status??1;
