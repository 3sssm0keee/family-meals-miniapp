// Only metadata travels through callContainer. Image bytes go directly to COS.
const pending = new Map();
function error(message) { return {code:'IMAGE_UPLOAD_FAILED',message}; }
function upload(url, filePath, formData) {
  if (!/^https:\/\/[a-z0-9-]+\.cos\.[a-z0-9-]+\.myqcloud\.com\/$/.test(url)) {
    return Promise.reject(error('上传地址无效，请重试'));
  }
  return new Promise((resolve, reject) => wx.uploadFile({
    url, filePath, name:'file', formData, timeout:120000,
    success:r => r.statusCode >= 200 && r.statusCode < 300
      ? resolve() : reject(error('图片上传失败，请重试（' + r.statusCode + '）')),
    fail:() => reject(error('图片上传连接失败，请检查网络；管理员请检查上传域名配置'))
  }));
}
async function uploadDishImage(familyId, filePath, services) {
  const account = require('./request.js').getAuthGeneration();
  const key = JSON.stringify([account, familyId, filePath]);
  // A failed completion retry must not upload a second copy or lose the first ticket.
  for (const [k,v] of pending) if (v.expires <= Date.now()) pending.delete(k);
  let state = pending.get(key);
  if (state && state.promise) return state.promise;
  if (!state) { state={expires:Date.now()+600000}; pending.set(key,state); }
  const work = async () => {
    if (!state.ticket) {
      const info = await new Promise((resolve,reject) => wx.getFileSystemManager().getFileInfo({filePath,success:resolve,fail:reject}));
      if (!info.size || info.size > 20*1024*1024) throw error('请选择20MB以内的图片');
      state.ticket = await services.createFileUpload(familyId, info.size);
      state.expires = Date.parse(state.ticket.expiresAt);
      if (!Number.isFinite(state.expires) || state.expires <= Date.now()) {
        pending.delete(key); throw error('上传授权已过期，请重新选择图片');
      }
    }
    if (!state.uploaded) {
      await upload(state.ticket.url, filePath, state.ticket.formData);
      state.uploaded = true;
    }
    const result = await services.completeFileUpload(familyId, state.ticket.ticket);
    pending.delete(key);
    return result;
  };
  state.promise=work();
  try { return await state.promise; }
  finally { state.promise=null; }
}
module.exports = {uploadDishImage};
