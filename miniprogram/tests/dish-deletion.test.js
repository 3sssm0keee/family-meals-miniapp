const test = require('node:test');
const assert = require('node:assert/strict');
const Services = require('../api/services.js');
const editor = require('../api/dish-editor.js');

function editorPage() {
  const app = { globalData: { activeFamily: { id: 'family-1', role: 'ADMIN' } } };
  global.getApp = () => app;
  global.wx = { showToast() {}, navigateBack() {}, switchTab() {} };
  const page = { ...editor, editFamilyId: 'family-1', data: { ...editor.data,
    isEditing: true, dishId: 'dish-1', expectedVersion: 3, adminAccessState: 'ready' } };
  page.setData = value => { page.data = { ...page.data, ...value }; };
  page.captureAdminAccess = () => app.globalData.activeFamily.role === 'ADMIN'
    ? { familyId: 'family-1' } : null;
  page.isAdminAccessCurrent = access => !!access && app.globalData.activeFamily.role === 'ADMIN';
  page.handleAdminError = () => false;
  return { page, app };
}

test('single deletion requires a matching preview and sends its expected version', async () => {
  const originalPreview = Services.getDishDeletionPreview;
  const originalDelete = Services.deleteDish;
  const calls = [];
  try {
    const { page } = editorPage();
    Services.getDishDeletionPreview = async () => ({ dishId: 'dish-1', name: '菜',
      expectedVersion: 4, variantCount: 2 });
    Services.deleteDish = async (...args) => { calls.push(args); };
    await page.onDeleteDish();
    assert.equal(page.data.deletePreview, null);
    assert.equal(page.data.conflict, true);
    await page.onConfirmDishDelete();
    assert.equal(calls.length, 0);

    page.setData({ conflict: false });
    Services.getDishDeletionPreview = async () => ({ dishId: 'dish-1', name: '菜',
      expectedVersion: 3, variantCount: 2 });
    await page.onDeleteDish();
    assert.equal(page.data.deletePreview.expectedVersion, 3);
    await page.onConfirmDishDelete();
    assert.deepEqual(calls, [['family-1', 'dish-1', 3]]);
  } finally {
    Services.getDishDeletionPreview = originalPreview;
    Services.deleteDish = originalDelete;
  }
});

test('uncertain deletion result cannot be submitted again from the same card', async () => {
  const originalPreview = Services.getDishDeletionPreview;
  const originalDelete = Services.deleteDish;
  let calls = 0;
  try {
    const { page } = editorPage();
    Services.getDishDeletionPreview = async () => ({ dishId: 'dish-1', name: '菜',
      expectedVersion: 3, variantCount: 1 });
    Services.deleteDish = async () => { calls++; throw { code: 'NETWORK_ERROR' }; };
    await page.onDeleteDish();
    await page.onConfirmDishDelete();
    assert.equal(page.data.deleteBlocked, true);
    assert.match(page.data.deleteError, /待核对/);
    await page.onConfirmDishDelete();
    assert.equal(calls, 1);
    page.onCancelDishDelete();
    await page.onDeleteDish();
    assert.equal(page.data.deleteBlocked, true);
    await page.onConfirmDishDelete();
    assert.equal(calls, 1);
    await page.onReconcileDishDelete();
    assert.equal(page.data.deleteBlocked, false);
  } finally {
    Services.getDishDeletionPreview = originalPreview;
    Services.deleteDish = originalDelete;
  }
});

test('list deletion remains blocked after closing and reopening an uncertain card', async () => {
  const saved = { getDishDeletionPreview: Services.getDishDeletionPreview,
    deleteDish: Services.deleteDish };
  const app = { globalData: { currentUser: { id: 'user-list' },
    activeFamily: { id: 'family-list', role: 'ADMIN' },
    currentSession: { id: 'session-list' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { showToast() {}, reLaunch() {}, switchTab() {} };
  let definition;
  global.Page = value => { definition = value; };
  let calls = 0;
  try {
    delete require.cache[require.resolve('../pages/admin-cleanup/index.js')];
    require('../pages/admin-cleanup/index.js');
    const page = { ...definition, route: 'pages/admin-cleanup/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.loadedContext = require('../api/session-context.js').capture(app);
    page.setData({ adminAccessState: 'ready', isAdmin: true });
    Services.getDishDeletionPreview = async () => ({ dishId: 'list-dish',
      name: '列表菜', expectedVersion: 8, variantCount: 1 });
    Services.deleteDish = async () => { calls++; throw { code: 'NETWORK_ERROR' }; };
    const event = { currentTarget: { dataset: { id: 'list-dish', version: 8 } } };
    await page.onDelete(event);
    await page.onConfirmDishDelete();
    page.onCancelDishDelete();
    await page.onDelete(event);
    assert.equal(page.data.deleteBlocked, true);
    await page.onConfirmDishDelete();
    assert.equal(calls, 1);
    await page.onReconcileDishDelete();
    assert.equal(page.data.deleteBlocked, false);
  } finally {
    Object.assign(Services, saved);
    delete global.Page;
  }
});

test('historical soft-deleted candidates require a per-dish preview before cleanup', async () => {
  const saved = { listAdminDishes: Services.listAdminDishes,
    getDishDeletionPreview: Services.getDishDeletionPreview, deleteDish: Services.deleteDish };
  const app = { globalData: { currentUser: { id: 'user-1' },
    activeFamily: { id: 'family-1', role: 'ADMIN' },
    currentSession: { id: 'session-1' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { showToast() {}, reLaunch() {}, switchTab() {} };
  let definition;
  global.Page = value => { definition = value; };
  const calls = [];
  try {
    delete require.cache[require.resolve('../pages/admin-cleanup/index.js')];
    require('../pages/admin-cleanup/index.js');
    const page = { ...definition, route: 'pages/admin-cleanup/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.loadedContext = require('../api/session-context.js').capture(app);
    page.setData({ adminAccessState: 'ready', isAdmin: true });
    Services.listAdminDishes = async (...args) => {
      calls.push(['list', ...args]);
      return { items: [{ id: 'old-dish', name: '旧菜', version: 7,
        deletedAt: '2026-09-22T15:00:00.000Z' }], total: 1 };
    };
    Services.getDishDeletionPreview = async (...args) => {
      calls.push(['preview', ...args]);
      return { dishId: 'old-dish', name: '旧菜', expectedVersion: 7, variantCount: 2 };
    };
    Services.deleteDish = async (...args) => { calls.push(['delete', ...args]); };
    await page.onToggleHistory();
    assert.deepEqual(calls[0], ['list', 'family-1', false, '', true]);
    assert.equal(page.data.historyCandidates[0].deletedAtText, '2026-09-22 23:00');
    await page.onDelete({ currentTarget: { dataset: { id: 'old-dish', version: 7 } } });
    assert.equal(page.data.deletePreview.dishId, 'old-dish');
    assert.equal(calls.some(call => call[0] === 'delete'), false);
    await page.onConfirmDishDelete();
    assert.deepEqual(calls.find(call => call[0] === 'delete'),
      ['delete', 'family-1', 'old-dish', 7]);
  } finally {
    Object.assign(Services, saved);
    delete global.Page;
  }
});

test('historical batch selects all, confirms once, and reports partial failure per dish', async () => {
  const saved = { getDishDeletionPreview: Services.getDishDeletionPreview,
    deleteDish: Services.deleteDish };
  const app = { globalData: { currentUser: { id: 'user-batch' },
    activeFamily: { id: 'family-batch', role: 'ADMIN' },
    currentSession: { id: 'session-batch' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { showToast() {} };
  let definition;
  global.Page = value => { definition = value; };
  const calls = [];
  try {
    delete require.cache[require.resolve('../pages/admin-cleanup/index.js')];
    require('../pages/admin-cleanup/index.js');
    const page = { ...definition, route: 'pages/admin-cleanup/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.loadedContext = require('../api/session-context.js').capture(app);
    page.setData({ adminAccessState: 'ready', isAdmin: true, historyOpen: true, historyCandidates: [
      { id: 'dish-A', name: '旧菜A', version: 2, selected: false },
      { id: 'dish-B', name: '旧菜B', version: 4, selected: false }
    ] });
    page.loadHistoryCandidates = async () => {};
    page.loadDishes = async () => {};
    Services.getDishDeletionPreview = async (_, id) => ({
      dishId: id, name: id, expectedVersion: id === 'dish-A' ? 2 : 4,
      variantCount: 1, cartItemCount: 0, submittedItemCount: 1, menuItemCount: 1 });
    Services.deleteDish = async (...args) => {
      calls.push(args);
      if (args[1] === 'dish-B') throw { statusCode: 409, code: 'VERSION_CONFLICT', message: '版本冲突' };
    };
    page.onSelectAllHistory();
    assert.equal(page.data.historySelectedCount, 2);
    await page.onPrepareHistoryBatch();
    assert.equal(page.data.batchPreview.dishCount, 2);
    assert.equal(calls.length, 0);
    await page.onConfirmHistoryBatch();
    assert.deepEqual(calls, [['family-batch', 'dish-A', 2], ['family-batch', 'dish-B', 4]]);
    assert.deepEqual(page.data.historyResults.map(item => item.status), ['已清理', '失败']);
    assert.equal(page.data.historyResults[1].reason, '版本冲突');
  } finally {
    Object.assign(Services, saved);
    delete global.Page;
  }
});

test('historical batch pauses after an uncertain result without repeating DELETE', async () => {
  const saved = { getDishDeletionPreview: Services.getDishDeletionPreview,
    deleteDish: Services.deleteDish };
  const app = { globalData: { currentUser: { id: 'user-batch-network' },
    activeFamily: { id: 'family-batch-network', role: 'ADMIN' },
    currentSession: { id: 'session-batch-network' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { showToast() {} };
  let definition;
  global.Page = value => { definition = value; };
  const calls = [];
  try {
    delete require.cache[require.resolve('../pages/admin-cleanup/index.js')];
    require('../pages/admin-cleanup/index.js');
    const page = { ...definition, route: 'pages/admin-cleanup/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.loadedContext = require('../api/session-context.js').capture(app);
    page.setData({ adminAccessState: 'ready', isAdmin: true, historyOpen: true, historyCandidates: [
      { id: 'dish-X', name: '旧菜X', version: 1, selected: true },
      { id: 'dish-Y', name: '旧菜Y', version: 1, selected: true }
    ], historySelectedCount: 2 });
    page.loadHistoryCandidates = async () => {};
    page.loadDishes = async () => {};
    Services.getDishDeletionPreview = async (_, id) => ({
      dishId: id, name: id, expectedVersion: 1, variantCount: 1 });
    Services.deleteDish = async (...args) => { calls.push(args); throw { code: 'NETWORK_ERROR' }; };
    await page.onPrepareHistoryBatch();
    await page.onConfirmHistoryBatch();
    assert.equal(calls.length, 1);
    assert.deepEqual(page.data.historyResults.map(item => item.status),
      ['结果待核对', '未执行']);
  } finally {
    Object.assign(Services, saved);
    delete global.Page;
  }
});

test('history panel stays open while batch preview is loading', async () => {
  const saved = Services.getDishDeletionPreview;
  const app = { globalData: { currentUser: { id: 'user-panel' },
    activeFamily: { id: 'family-panel', role: 'ADMIN' },
    currentSession: { id: 'session-panel' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { showToast() {} };
  let definition, finish;
  global.Page = value => { definition = value; };
  try {
    delete require.cache[require.resolve('../pages/admin-cleanup/index.js')];
    require('../pages/admin-cleanup/index.js');
    const page = { ...definition, route: 'pages/admin-cleanup/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.loadedContext = require('../api/session-context.js').capture(app);
    page.setData({ adminAccessState: 'ready', isAdmin: true, historyOpen: true, historyCandidates: [
      { id: 'dish-panel', name: '旧菜', version: 1, selected: true }
    ], historySelectedCount: 1 });
    Services.getDishDeletionPreview = () => new Promise(resolve => { finish = resolve; });
    const preparing = page.onPrepareHistoryBatch();
    assert.equal(page.data.batchRunning, true);
    await page.onToggleHistory();
    assert.equal(page.data.historyOpen, true);
    finish({ dishId: 'dish-panel', name: '旧菜', expectedVersion: 1, variantCount: 1 });
    await preparing;
    assert.equal(page.data.batchRunning, false);
    assert.equal(page.data.batchPreview.dishCount, 1);
  } finally {
    Services.getDishDeletionPreview = saved;
    delete global.Page;
  }
});
