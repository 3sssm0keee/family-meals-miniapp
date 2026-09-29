const CONFIG = require('../config.js');
let initialized = false;
let serial = 0;
const cache = new Map();
function clear() {
  for (const entry of cache.values()) if (entry.path) wx.getFileSystemManager().unlink({filePath: entry.path, fail() {}});
  cache.clear();
}
function call(options) {
  if (!initialized) {
    wx.cloud.init({ env: CONFIG.CLOUD_ENV });
    initialized = true;
  }
  return wx.cloud.callContainer({
    ...options, config: { env: CONFIG.CLOUD_ENV },
    header: { ...options.header, 'X-WX-SERVICE': CONFIG.CLOUD_SERVICE }
  });
}
function ascii(text) { return Uint8Array.from(text.split('').map(c => c.charCodeAt(0))); }
async function send(options, header) {
  let data = options.data;
  header = { 'Content-Type': 'application/json', ...header };
  if (options.filePath) {
    let file = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
      filePath: options.filePath, success: r => resolve(r.data), fail: reject
    }));
    if (file.byteLength > 5242880) throw { code: 'FILE_TOO_LARGE', message: '图片不能超过 5 MB' };
    // Leave room for multipart headers and gateway encoding within the request limit.
    if (file.byteLength > 60000) {
      for (const quality of [60, 35, 15]) {
        const compressed = await new Promise((resolve, reject) => wx.compressImage({src: options.filePath, quality, success: resolve, fail: reject}));
        file = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({filePath: compressed.tempFilePath, success: r => resolve(r.data), fail: reject}));
        if (file.byteLength <= 60000) break;
      }
      if (file.byteLength > 60000) throw { code: 'FILE_TOO_LARGE', message: '云托管测试模式请使用较小图片，压缩后需小于60KB' };
    }
    const boundary = 'FamilyMeal' + Date.now() + (++serial);
    const head = ascii('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="image"\r\nContent-Type: application/octet-stream\r\n\r\n');
    const tail = ascii('\r\n--' + boundary + '--\r\n');
    const bytes = new Uint8Array(head.length + file.byteLength + tail.length);
    bytes.set(head); bytes.set(new Uint8Array(file), head.length); bytes.set(tail, head.length + file.byteLength);
    data = bytes.buffer;
    header['Content-Type'] = 'multipart/form-data; boundary=' + boundary;
  }
  return call({ path: '/api/v1' + options.url, method: options.method || 'GET', data, header });
}
// Signed assets use the same service route; never send arbitrary URLs to the gateway.
async function images(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Promise.all(value.map(images));
  const result = { ...value };
  const origin = CONFIG.BASE_URL.replace(/\/api\/v1\/?$/, '');
  if (value.fileId && typeof value.url === 'string' && value.url.startsWith(origin + '/assets/')) {
    for (const [key, entry] of cache) {
      if (entry.expires <= Date.now()) {
        wx.getFileSystemManager().unlink({filePath: entry.path, fail() {}});
        cache.delete(key);
      }
    }
    const cacheKey = value.url.split('?')[0];
    const cached = cache.get(cacheKey);
    if (cached) return { ...value, url: cached.path };
    const response = await call({ path: value.url.slice(origin.length), method: 'GET', responseType: 'arraybuffer' });
    if (response.statusCode !== 200) throw { code: 'IMAGE_UNAVAILABLE', message: '图片读取失败，请刷新重试' };
    const mime = (response.header || {})['content-type'] || (response.header || {})['Content-Type'] || '';
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime.split(';')[0]];
    if (!ext) throw { code: 'IMAGE_UNAVAILABLE', message: '图片格式无效' };
    const filePath = wx.env.USER_DATA_PATH + '/cloud-image-' + Date.now() + '-' + (++serial) + '.' + ext;
    await new Promise((resolve, reject) => wx.getFileSystemManager().writeFile({filePath, data: response.data, success: resolve, fail: reject}));
    result.url = filePath;
    cache.set(cacheKey, { path: filePath, expires: Math.min(Date.parse(value.expiresAt) || Date.now(), Date.now() + 900000) });
  }
  for (const key of Object.keys(result)) if (result[key] && typeof result[key] === 'object') result[key] = await images(result[key]);
  return result;
}
module.exports = { send, images, clear };
