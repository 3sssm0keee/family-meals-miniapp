// 工具函数库

/**
 * 生成符合契约规范的 Idempotency-Key
 * 正则: ^[A-Za-z0-9_-]{16,128}$
 */
function generateIdempotencyKey(prefix = 'idem') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let rand = '';
  for (let i = 0; i < 20; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${Date.now()}_${rand}`;
}

/**
 * 格式化日期 YYYY-MM-DD
 */
function formatDate(date) {
  const d = date ? new Date(date) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化时间 HH:mm
 */
function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** 服务端 ISO 时间统一显示为北京时间，避免设备本地时区影响。 */
function formatBeijingDateTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (!Number.isFinite(date.getTime())) return '';
  const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = beijing.getUTCFullYear();
  const month = String(beijing.getUTCMonth() + 1).padStart(2, '0');
  const day = String(beijing.getUTCDate()).padStart(2, '0');
  const hour = String(beijing.getUTCHours()).padStart(2, '0');
  const minute = String(beijing.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

/**
 * 格式化份数（保留一位小数）
 */
function formatQuantity(num) {
  if (num === null || num === undefined || isNaN(num)) return '';
  const n = parseFloat(num);
  return Number.isInteger(n) ? n.toString() : n.toFixed(1);
}

/**
 * 轻提示封装
 */
function toast(title, icon = 'none', duration = 2000) {
  wx.showToast({
    title,
    icon,
    duration
  });
}

module.exports = {
  generateIdempotencyKey,
  formatDate,
  formatTime,
  formatBeijingDateTime,
  formatQuantity,
  toast
};
