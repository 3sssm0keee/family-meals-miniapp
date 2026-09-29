export function validateCloudrunConfig(env = process.env) {
  if (env.DEPLOY_TARGET !== 'wechat-cloudrun') return;
  const required = ['DATABASE_URL', 'WECHAT_APP_ID', 'WECHAT_APP_SECRET', 'JWT_SECRET',
    'IDEMPOTENCY_ENCRYPTION_KEY', 'FILE_SIGNING_KEY', 'FILE_PUBLIC_BASE_URL',
    'COS_BUCKET', 'COS_REGION'];
  if (!env.COS_AUTH_MODE || env.COS_AUTH_MODE === 'static') required.push('COS_SECRET_ID', 'COS_SECRET_KEY');
  else if (env.COS_AUTH_MODE !== 'wechat-cloudrun') throw new Error('Unknown COS_AUTH_MODE');
  for (const key of required) {
    if (!env[key] || /replace_with|changeme/i.test(env[key]!)) throw new Error(`${key} must be configured`);
  }
  for (const key of ['JWT_SECRET', 'FILE_SIGNING_KEY']) {
    if (Buffer.byteLength(env[key]!) < 32) throw new Error(`${key} requires at least 32 bytes`);
  }
  if (Buffer.from(env.IDEMPOTENCY_ENCRYPTION_KEY!, 'base64').length !== 32) {
    throw new Error('IDEMPOTENCY_ENCRYPTION_KEY requires 32 decoded bytes');
  }
  if (new URL(env.DATABASE_URL!).protocol !== 'mysql:') throw new Error('DATABASE_URL must use mysql');
  const base = new URL(env.FILE_PUBLIC_BASE_URL!);
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('FILE_PUBLIC_BASE_URL must be an HTTPS origin');
  }
  if (env.REGISTRATION_ADMIN_CODE && env.REGISTRATION_ADMIN_CODE.length < 32) {
    throw new Error('REGISTRATION_ADMIN_CODE requires at least 32 characters');
  }
  if (env.HOST !== '0.0.0.0') throw new Error('Cloudrun HOST must be 0.0.0.0');
  if (env.FILE_STORAGE_DRIVER !== 'cos') throw new Error('Cloudrun requires persistent COS storage');
}
