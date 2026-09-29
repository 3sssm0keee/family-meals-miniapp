import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { spawnSync } from 'node:child_process';
const path=process.argv[2];if(!path)throw new Error('Pass isolated database env file');
const env=parse(readFileSync(path)),url=new URL(env.DATABASE_URL);
if(url.hostname!=='127.0.0.1'||url.port!=='3317'||url.pathname!=='/family_meals_base_test')throw new Error('Refusing non-isolated database');
const result=spawnSync(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy'],{env:{...process.env,DATABASE_URL:env.DATABASE_URL},stdio:'inherit'});
process.exitCode=result.status??1;
