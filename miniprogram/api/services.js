// 业务 API 服务层：严格对齐 openapi-v1.json 中的全部 25+ 接口
const { request, getActiveFamily } = require('./request.js');

const transport = require('./transport.js');
const { uploadDishImage } = require('./direct-upload.js');
const CONFIG = require('../config.js');
async function listAllDishes(url) {
  const items = [];
  for (let page = 1; ; page++) {
    const result = await request({url: url + (url.includes('?') ? '&' : '?') + 'page=' + page + '&pageSize=100', method: 'GET'});
    items.push(...(result.items || []));
    if (items.length >= result.total || (result.items || []).length < 100) return {...result, items};
  }
}
const Services = {
  // 1. 授权与用户
  login: (code) => request({ url: '/auth/login', method: 'POST', data: { code } }),
  uploadAvatar: (filePath) => transport.send({url: '/me/avatar', method: 'POST', filePath}),
  getMe: () => request({ url: '/me', method: 'GET' }),
  updateMe: (displayName) => request({ url: '/me', method: 'PATCH', data: { displayName } }),
  listFamilyMembers: (familyId, page = 1) => request({ url: `/families/${familyId}/members?page=${page}&pageSize=100`, method: 'GET' }),
  listMyFamilies: () => request({ url: '/me/families', method: 'GET' }),
  createFamily: (name) => request({ url: '/families', method: 'POST', data: { name } }),

  // 2. 餐次管理
  ensureSession: (familyId, serviceDate, mealType) =>
    request({ url: `/families/${familyId}/meal-sessions`, method: 'POST', data: { serviceDate, mealType } }),
  listSessions: (familyId, serviceDate, mealType) =>
    request({ url: `/families/${familyId}/meal-sessions?serviceDate=${serviceDate}&mealType=${mealType}`, method: 'GET' }),
  getSession: (familyId, sessionId) =>
    request({ url: `/families/${familyId}/meal-sessions/${sessionId}`, method: 'GET' }),

  // 3. 菜品浏览与加购
  listDishes: (familyId, sessionId, q = '') =>
    listAllDishes(`/families/${familyId}/dishes?sessionId=${sessionId}&q=${encodeURIComponent(q)}`),
  getDish: (familyId, dishId, sessionId) =>
    request({ url: `/families/${familyId}/dishes/${dishId}?sessionId=${sessionId}`, method: 'GET' }),

  // 4. 购物车
  getCart: (familyId, sessionId) =>
    request({ url: `/families/${familyId}/meal-sessions/${sessionId}/cart`, method: 'GET' }),
  addCartItem: (familyId, sessionId, variantId) =>
    request({ url: `/families/${familyId}/meal-sessions/${sessionId}/cart/items/${variantId}`, method: 'PUT' }),
  removeCartItem: (familyId, sessionId, variantId) =>
    request({ url: `/families/${familyId}/meal-sessions/${sessionId}/cart/items/${variantId}`, method: 'DELETE' }),

  // 5. 个人点餐与家庭菜单
  submitMenu: (familyId, sessionId, variantIds, note) =>
    request({ url: `/families/${familyId}/meal-sessions/${sessionId}/personal-menu`, method: 'POST', data: { variantIds, note } }),
  appendMenu: (familyId, sessionId, variantIds, expectedVersion) =>
    request({ url: `/families/${familyId}/meal-sessions/${sessionId}/personal-menu/items`, method: 'POST', data: { variantIds, expectedVersion } }),
  getPersonalMenu: (familyId, sessionId) =>
    request({ url: `/families/${familyId}/meal-sessions/${sessionId}/personal-menu`, method: 'GET' }),
  updateCartItemNote: (familyId, sessionId, variantId, note, expectedVersion) =>
    request({ url: `/families/${familyId}/meal-sessions/${sessionId}/cart/items/${variantId}/note`, method: 'PATCH', data: { note, expectedVersion } }),
  updatePersonalItemNote: (familyId, sessionId, variantId, note, expectedVersion) =>
    request({ url: `/families/${familyId}/meal-sessions/${sessionId}/personal-menu/items/${variantId}/note`, method: 'PATCH', data: { note, expectedVersion } }),
  updateNote: (familyId, sessionId, note, expectedVersion) =>
    request({ url: `/families/${familyId}/meal-sessions/${sessionId}/personal-menu/note`, method: 'PATCH', data: { note, expectedVersion } }),
  getFamilyMenu: (familyId, sessionId) =>
    request({ url: `/families/${familyId}/meal-sessions/${sessionId}/menu`, method: 'GET' }),

  // 6. 管理员审核视图与批量决议
  getReview: (familyId, sessionId) =>
    request({ url: `/families/${familyId}/admin/meal-sessions/${sessionId}/review`, method: 'GET' }),
  reviewMenu: (familyId, sessionId, expectedReviewVersion, items) =>
    request({ url: `/families/${familyId}/admin/meal-sessions/${sessionId}/review`, method: 'POST', data: { expectedReviewVersion, items } }),

  // 7. 临时菜与菜品库管理
  createTemporaryDish: (familyId, sessionId, dishData) =>
    request({ url: `/families/${familyId}/admin/meal-sessions/${sessionId}/temporary-dishes`, method: 'POST', data: dishData }),
  promoteDish: (familyId, dishId, expectedVersion) =>
    request({ url: `/families/${familyId}/admin/dishes/${dishId}/promote`, method: 'POST', data: { expectedVersion } }),
  listAdminDishes: (familyId, includeDeleted = false, sessionId = '', onlyDeleted = false) =>
    listAllDishes(`/families/${familyId}/admin/dishes?includeDeleted=${includeDeleted}` +
      (sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : '') +
      (onlyDeleted ? '&onlyDeleted=true' : '')),
  getDishDeletionPreview: (familyId, dishId) =>
    request({ url: `/families/${familyId}/admin/dishes/${dishId}/deletion-preview`, method: 'GET' }),
  createDish: (familyId, dishData) =>
    request({ url: `/families/${familyId}/admin/dishes`, method: 'POST', data: dishData }),
  updateDish: (familyId, dishId, dishData) =>
    request({ url: `/families/${familyId}/admin/dishes/${dishId}`, method: 'PATCH', data: dishData }),
  deleteDish: (familyId, dishId, expectedVersion) =>
    request({ url: `/families/${familyId}/admin/dishes/${dishId}?expectedVersion=${expectedVersion}`, method: 'DELETE' }),
  listFileCleanupCandidates: familyId =>
    listAllDishes(`/families/${familyId}/admin/files/cleanup-candidates`),
  requestFileCleanup: (familyId, fileId) =>
    request({ url: `/families/${familyId}/admin/files/${fileId}/cleanup`, method: 'POST' }),
  getFileCleanupTask: (familyId, taskId) =>
    request({ url: `/families/${familyId}/admin/file-cleanup-tasks/${taskId}`, method: 'GET' }),

  // 8. 成员与邀请
  listMembers: (familyId, page = 1) =>
    request({ url: `/families/${familyId}/admin/members?page=${page}&pageSize=100`, method: 'GET' }),
  createInvite: (familyId, role = 'GUEST') =>
    request({ url: `/families/${familyId}/admin/invites`, method: 'POST', data: { role } }),
  listInvites: (familyId) =>
    request({ url: `/families/${familyId}/admin/invites`, method: 'GET' }),
  redeemInvite: (code) =>
    request({ url: '/invites/redeem', method: 'POST', data: { code } }),
  leaveFamily: (familyId) =>
    request({ url: `/families/${familyId}/members/me`, method: 'DELETE' }),

  // 9. 审计日志
  listOperations: (familyId, sessionId, page = 1) =>
    request({ url: `/families/${familyId}/admin/operations?page=${page}&pageSize=100` +
      (sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : ''), method: 'GET' }),

  // 10. 规格维护、文件上传与成员管理 (对齐 OpenAPI 全部 43 operationId)
  getAdminDish: (familyId, dishId) =>
    request({ url: `/families/${familyId}/admin/dishes/${dishId}`, method: 'GET' }),
  createVariant: (familyId, dishId, variantData) =>
    request({ url: `/families/${familyId}/admin/dishes/${dishId}/variants`, method: 'POST', data: variantData }),
  updateVariant: (familyId, dishId, variantId, variantData) =>
    request({ url: `/families/${familyId}/admin/dishes/${dishId}/variants/${variantId}`, method: 'PATCH', data: variantData }),
  deleteVariant: (familyId, dishId, variantId, expectedVersion) =>
    request({ url: `/families/${familyId}/admin/dishes/${dishId}/variants/${variantId}?expectedVersion=${expectedVersion}`, method: 'DELETE' }),
  createFileUpload: (familyId, sizeBytes) => request({url:`/families/${familyId}/admin/files/uploads`,method:'POST',data:{sizeBytes}}),
  completeFileUpload: (familyId, ticket) => request({url:`/families/${familyId}/admin/files/uploads/complete`,method:'POST',data:{ticket}}),
  uploadFile: (familyId, filePath) => CONFIG.USE_MOCK
    ? Promise.reject({ code: 'MOCK_UPLOAD_UNAVAILABLE', message: '演示模式不模拟图片上传成功' })
    : CONFIG.TRANSPORT_MODE === 'cloudrun' ? uploadDishImage(familyId, filePath, Services)
    : transport.send({ url: `/families/${familyId}/admin/files`, method: 'POST', filePath }),
  getFile: (familyId, fileId) =>
    request({ url: `/families/${familyId}/files/${fileId}`, method: 'GET' }),
  revokeInvite: (familyId, inviteId) =>
    request({ url: `/families/${familyId}/admin/invites/${inviteId}`, method: 'DELETE' }),
  updateMemberRole: (familyId, memberId, role) =>
    request({ url: `/families/${familyId}/admin/members/${memberId}`, method: 'PATCH', data: { role } }),
  removeMember: (familyId, memberId) =>
    request({ url: `/families/${familyId}/admin/members/${memberId}`, method: 'DELETE' }),
  getNotificationConfig: (familyId) =>
    request({ url: `/families/${familyId}/notification-config`, method: 'GET' }),
  recordSubscriptionResult: (familyId, resultData) =>
    request({ url: `/families/${familyId}/subscription-results`, method: 'POST', data: resultData }),
  listMyNotifications: (familyId, page = 1, pageSize = 20) =>
    request({ url: `/families/${familyId}/notifications?page=${page}&pageSize=${pageSize}`, method: 'GET' })
};

module.exports = Services;
