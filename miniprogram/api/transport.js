// Real transport only. Pending intents survive retries in memory, never in logs/storage.
const CONFIG = require('../config.js');
const util = require('../utils/util.js');
const cloudrun = require('./cloudrun.js');
let token = null;
let expired = null;
const intents = new Map();
function setToken(value) { token = value || null; if (!token) { intents.clear(); cloudrun.clear(); } }
function onExpired(fn) { expired = fn; }
function error(code, message, details) { return { code, message, details }; }
function baseUrl() {
  if (!/^https?:\/\/[^/]+\/api\/v1\/?$/.test(CONFIG.BASE_URL)) {
    throw error('CONFIG_REQUIRED', '请先配置真实后端地址');
  }
  return CONFIG.BASE_URL.replace(/\/$/, '');
}
function send(options) {
  const method = (options.method || 'GET').toUpperCase();
  const login = options.url === '/auth/login';
  if (!login && !token) return Promise.reject(error('AUTH_REQUIRED', '请先登录，草稿仍保留在当前页面'));
  const writing = method !== 'GET' && !login;
  const fingerprint = JSON.stringify([token, method, options.url, options.data, options.filePath]);
  let intent = intents.get(fingerprint);
  if (intent && intent.promise) return intent.promise;
  if (!intent) intent = { key: options.idempotencyKey || util.generateIdempotencyKey() };
  let url;
  try { url = baseUrl() + options.url; } catch (e) { return Promise.reject(e); }
  const header = { ...(options.headers || {}) };
  if (token && !login) header.Authorization = 'Bearer ' + token;
  if (writing) header['Idempotency-Key'] = intent.key;
  const promise = new Promise((resolve, reject) => {
    const finish = (res) => {
      let body = res.data;
      try { if (typeof body === 'string') body = JSON.parse(body); } catch (_) { body = null; }
      if (res.statusCode >= 200 && res.statusCode < 300 && body &&
          Object.prototype.hasOwnProperty.call(body, 'data') && !body.error) {
        intents.delete(fingerprint);
        if (CONFIG.TRANSPORT_MODE === 'cloudrun') cloudrun.images(body.data).then(resolve, reject);
        else resolve(body.data);
        return;
      }
      const e = body && body.error || error('INVALID_RESPONSE', '服务器响应无效，请保留草稿');
      e.statusCode = res.statusCode;
      // Only definitive client errors retire an intent. 5xx/network outcomes may be committed.
      if (res.statusCode >= 400 && res.statusCode < 500 &&
          !['REQUEST_IN_PROGRESS', 'RATE_LIMITED'].includes(e.code)) intents.delete(fingerprint);
      if (res.statusCode === 401) {
        setToken(null);
        if (expired && !login) expired();
      }
      if (res.statusCode === 429) e.retryAfter = Number((res.header || {})['Retry-After'] || 0);
      reject(e);
    };
    const fail = () => reject(error('NETWORK_ERROR', '网络结果不明，请保留草稿；重试将沿用原请求键'));
    if (CONFIG.TRANSPORT_MODE === 'cloudrun') {
      cloudrun.send(options, header).then(finish, e => e && e.code === 'FILE_TOO_LARGE' ? reject(e) : fail());
    } else if (options.filePath) {
      wx.uploadFile({ url, filePath: options.filePath, name: 'file', header, success: finish, fail });
    } else {
      wx.request({ url, method, data: options.data, header: { 'Content-Type': 'application/json', ...header }, success: finish, fail });
    }
  });
  if (writing) { intent.promise = promise; intents.set(fingerprint, intent); }
  return promise.finally(() => { intent.promise = null; });
}
module.exports = { send, setToken, onExpired };
