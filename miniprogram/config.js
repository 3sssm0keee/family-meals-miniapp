// 环境与全局业务配置
const CONFIG = {
  TRANSPORT_MODE: 'cloudrun',
  CLOUD_ENV: 'YOUR_CLOUD_ENV',
  CLOUD_SERVICE: 'family-meals-api',
  // 后端地址统一由 BASE_URL 配置。
  // 当前使用云托管测试地址；迁移服务器时替换此统一入口。
  BASE_URL: 'https://example.invalid/api/v1',
  // Mock 隔离开关：当前后端未部署或无测试网时启用完整 Mock 引擎
  USE_MOCK: false,
  // 时区约定
  TIMEZONE: 'Asia/Shanghai',
  // 轮询间隔（审核页无编辑时 15 秒刷新）
  REVIEW_POLL_INTERVAL_MS: 15000,
  // 签名图片有效时间（分）
  IMAGE_EXPIRE_MINUTES: 15
};

module.exports = CONFIG;
