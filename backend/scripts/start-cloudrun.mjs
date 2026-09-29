import { spawnSync } from 'node:child_process';

// Prisma uses its migration lock; a failed migration must prevent serving traffic.
if (process.env.DEPLOY_TARGET === 'wechat-cloudrun') {
  const migration = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
    stdio: 'inherit', env: process.env,
  });
  if (migration.error || migration.status !== 0) {
    console.error('Database migration failed; service startup stopped.');
    process.exit(1);
  }
}
await import('../dist/backend/src/main.js');
