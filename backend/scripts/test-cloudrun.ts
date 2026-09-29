import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateCloudrunConfig } from '../src/common/cloudrun-config.js';
import { putAsset, readAsset, storageDriver } from '../src/file/storage.js';
import { InviteService } from '../src/invite/invite.service.js';
import { AccessService } from '../src/common/access.service.js';
import type { TransactionClient } from '../src/database/prisma.service.js';

test('cloud configuration rejects ephemeral storage, missing credentials and weak admin code', () => {
  const env = {
    DEPLOY_TARGET: 'wechat-cloudrun', HOST: '0.0.0.0', FILE_STORAGE_DRIVER: 'cos',
    DATABASE_URL: 'mysql://u:p@db:3306/family_meals', WECHAT_APP_ID: 'test', WECHAT_APP_SECRET: 'test',
    JWT_SECRET: 'x'.repeat(32), FILE_SIGNING_KEY: 'y'.repeat(32),
    IDEMPOTENCY_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    FILE_PUBLIC_BASE_URL: 'https://kitchen.test', COS_BUCKET: 'test-123', COS_REGION: 'ap-shanghai',
    COS_SECRET_ID: 'test', COS_SECRET_KEY: 'test',
  };
  assert.doesNotThrow(() => validateCloudrunConfig(env));
  assert.throws(() => validateCloudrunConfig({...env, FILE_STORAGE_DRIVER: 'local'}));
  assert.throws(() => validateCloudrunConfig({...env, COS_SECRET_KEY: ''}));
  assert.doesNotThrow(() => validateCloudrunConfig({...env, COS_AUTH_MODE: 'wechat-cloudrun', COS_SECRET_ID: '', COS_SECRET_KEY: ''}));
  assert.throws(() => validateCloudrunConfig({...env, COS_AUTH_MODE: 'unknown'}));
  assert.throws(() => validateCloudrunConfig({...env, FILE_PUBLIC_BASE_URL: 'http://kitchen.test'}));
  assert.throws(() => validateCloudrunConfig({...env, REGISTRATION_ADMIN_CODE: 'REPLACE_LEGACY_CODE'}));
});

test('local storage round trip and cloud fail closed instead of silently using local disk', async () => {
  const saved = {driver: process.env.FILE_STORAGE_DRIVER, root: process.env.FILE_STORAGE_ROOT, target: process.env.DEPLOY_TARGET};
  const root = await mkdtemp(join(tmpdir(), 'family-meals-storage-'));
  try {
    process.env.FILE_STORAGE_DRIVER = 'local'; process.env.FILE_STORAGE_ROOT = root;
    delete process.env.DEPLOY_TARGET;
    const key = randomUUID(), data = Buffer.from('storage-round-trip');
    await putAsset(key, data, 'application/octet-stream');
    assert.deepEqual(await readAsset(key), data);
    await assert.rejects(() => putAsset(key, data, 'application/octet-stream'));
    process.env.DEPLOY_TARGET = 'wechat-cloudrun';
    assert.throws(() => storageDriver());
  } finally {
    for (const [key, value] of Object.entries({FILE_STORAGE_DRIVER: saved.driver, FILE_STORAGE_ROOT: saved.root, DEPLOY_TARGET: saved.target})) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await rm(root, {recursive: true});
  }
});

test('old hardcoded administrator code cannot grant membership', async () => {
  const tx = {invite: {findUnique: async () => null}} as unknown as TransactionClient;
  await assert.rejects(() => new InviteService(new AccessService()).redeem(tx, {userId:'u',requestId:'r'}, 'REPLACE_LEGACY_CODE'), {code:'NOT_FOUND'});
});

test('managed COS rejects expired credentials and unavailable provider without a disk fallback', async () => {
  const saved = {...process.env};
  const originalFetch = globalThis.fetch;
  try {
    Object.assign(process.env, {DEPLOY_TARGET:'wechat-cloudrun', FILE_STORAGE_DRIVER:'cos', COS_AUTH_MODE:'wechat-cloudrun'});
    globalThis.fetch = async (url) => {
      assert.equal(url, 'http://api.weixin.qq.com/_/cos/getauth');
      return new Response(JSON.stringify({TmpSecretId:'fixture',TmpSecretKey:'fixture',Token:'fixture',ExpiredTime:1}));
    };
    await assert.rejects(() => putAsset(randomUUID(), Buffer.from('x'), 'image/png'), /Invalid managed COS/);
    globalThis.fetch = async () => new Response('', {status:503});
    await assert.rejects(() => readAsset(randomUUID()), /authentication unavailable/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of ['DEPLOY_TARGET','FILE_STORAGE_DRIVER','COS_AUTH_MODE']) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});
