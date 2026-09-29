const test = require('node:test');
const assert = require('node:assert/strict');
const Services = require('../api/services.js');
const mealContext = require('../api/session-context.js');

test('files maintenance entry opens its own candidate list after admin verification', async () => {
  const saved = { listMyFamilies: Services.listMyFamilies,
    listFileCleanupCandidates: Services.listFileCleanupCandidates,
    listAdminDishes: Services.listAdminDishes };
  const app = { globalData: { currentUser: { id: 'user-route' },
    activeFamily: { id: 'family-route', role: 'ADMIN' },
    currentSession: { id: 'session-route' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { showToast() {}, switchTab() {}, reLaunch() {} };
  let definition;
  global.Page = value => { definition = value; };
  let fileLoads = 0, dishLoads = 0;
  try {
    delete require.cache[require.resolve('../pages/admin-cleanup/index.js')];
    require('../pages/admin-cleanup/index.js');
    const page = { ...definition, route: 'pages/admin-cleanup/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    Services.listMyFamilies = async () => [{ id: 'family-route', role: 'ADMIN' }];
    Services.listFileCleanupCandidates = async () => { fileLoads++; return { items: [], total: 0 }; };
    Services.listAdminDishes = async () => { dishLoads++; return { items: [], total: 0 }; };
    page.onLoad({ type: 'files' });
    await page.onShow();
    assert.equal(page.data.viewType, 'files');
    assert.equal(page.data.fileCleanupOpen, true);
    assert.equal(fileLoads, 1);
    assert.equal(dishLoads, 0);
  } finally {
    Object.assign(Services, saved);
    delete global.Page;
  }
});

test('image cleanup reports task state instead of treating 202 as deletion', async () => {
  const saved = { listFileCleanupCandidates: Services.listFileCleanupCandidates,
    requestFileCleanup: Services.requestFileCleanup, getFileCleanupTask: Services.getFileCleanupTask };
  const app = { globalData: { currentUser: { id: 'user-file' },
    activeFamily: { id: 'family-file', role: 'ADMIN' },
    currentSession: { id: 'session-file' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { showToast() {}, showModal({ success }) { success({ confirm: true }); } };
  let definition;
  global.Page = value => { definition = value; };
  try {
    delete require.cache[require.resolve('../pages/admin-cleanup/index.js')];
    require('../pages/admin-cleanup/index.js');
    const page = { ...definition, route: 'pages/admin-cleanup/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.loadedContext = mealContext.capture(app);
    page.setData({ adminAccessState: 'ready', isAdmin: true });
    Services.listFileCleanupCandidates = async () => ({ items: [{
      fileId: 'file-1', sizeBytes: 1024, createdAt: '2026-09-22T15:00:00Z',
      canCleanup: true, taskStatus: null }], total: 1 });
    Services.requestFileCleanup = async () => ({ taskId: 'task-1' });
    Services.getFileCleanupTask = async () => ({ taskId: 'task-1', fileId: 'file-1', status: 'DELETING' });
    await page.onToggleFileCleanup();
    assert.equal(page.data.fileCandidates[0].createdAtText, '2026-09-22 23:00');
    await page.requestFileCleanup(page.loadedContext, 'file-1');
    assert.equal(page.data.fileCandidates[0].taskId, 'task-1');
    assert.equal(page.data.fileCandidates[0].taskStatus, 'DELETING');
    for (const [status, code, expected] of [
      ['FAILED', 'STORAGE_DELETE_FAILED', '存储图片删除失败'],
      ['FAILED', 'REFERENCE_AFTER_DELETE', '检测到新引用'],
      ['SKIPPED', 'FILE_REFERENCED', '仍被菜品或头像引用'],
      ['FAILED', 'OTHER_CODE', '清理失败']
    ]) {
      Services.getFileCleanupTask = async () => ({
        taskId: 'task-1', fileId: 'file-1', status, lastErrorCode: code
      });
      await page.refreshFileCleanupTask(page.loadedContext, 'file-1', 'task-1');
      assert.match(page.data.fileCandidates[0].failureText, new RegExp(expected));
    }
  } finally {
    Object.assign(Services, saved);
    delete global.Page;
  }
});

test('lost image cleanup response is reconciled from candidate taskId', async () => {
  const saved = { listFileCleanupCandidates: Services.listFileCleanupCandidates,
    requestFileCleanup: Services.requestFileCleanup, getFileCleanupTask: Services.getFileCleanupTask };
  const app = { globalData: { currentUser: { id: 'user-lost' },
    activeFamily: { id: 'family-lost', role: 'ADMIN' },
    currentSession: { id: 'session-lost' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { showToast() {} };
  let definition;
  global.Page = value => { definition = value; };
  let queryCount = 0;
  try {
    delete require.cache[require.resolve('../pages/admin-cleanup/index.js')];
    require('../pages/admin-cleanup/index.js');
    const page = { ...definition, route: 'pages/admin-cleanup/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.loadedContext = mealContext.capture(app);
    page.setData({ adminAccessState: 'ready', isAdmin: true });
    Services.listFileCleanupCandidates = async () => ({ items: [{
      fileId: 'file-lost', sizeBytes: 1024, createdAt: '2026-09-22T15:00:00Z',
      canCleanup: true, taskStatus: 'PENDING', taskId: 'task-lost' }], total: 1 });
    Services.requestFileCleanup = async () => { throw { code: 'NETWORK_ERROR' }; };
    Services.getFileCleanupTask = async () => { queryCount++; return {
      taskId: 'task-lost', fileId: 'file-lost', status: 'DELETING' }; };
    page.setData({ fileCleanupOpen: true, fileCandidates: [{ fileId: 'file-lost', canCleanup: true }] });
    await page.requestFileCleanup(page.loadedContext, 'file-lost');
    assert.equal(page.data.fileCleanupUncertain, 'file-lost');
    await page.loadFileCleanupCandidates();
    assert.equal(queryCount, 1);
    assert.equal(page.data.fileCandidates[0].taskStatus, 'DELETING');
    assert.equal(page.data.fileCandidates[0].taskId, 'task-lost');
  } finally {
    Object.assign(Services, saved);
    delete global.Page;
  }
});
