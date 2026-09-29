const test = require('node:test');
const assert = require('node:assert/strict');

const Services = require('../api/services.js');

test('workbench uses server selectableCount for the active meal and ignores an old meal response', async () => {
  const saved = {
    listMyFamilies: Services.listMyFamilies,
    ensureSession: Services.ensureSession,
    listAdminDishes: Services.listAdminDishes,
    getReview: Services.getReview
  };
  const app = { globalData: { currentUser: { id: 'user-1', displayName: '掌勺人' },
    activeFamily: { id: 'family-1', role: 'ADMIN' }, selectedMealType: 'LUNCH', sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { reLaunch() {}, switchTab() {}, showToast() {} };
  let definition;
  global.Page = value => { definition = value; };
  Services.listMyFamilies = async () => [app.globalData.activeFamily];
  Services.ensureSession = async (_familyId, _date, mealType) => ({ id: mealType + '-session', canSubmit: true });
  let finishLunch;
  const pendingLunch = new Promise(resolve => { finishLunch = resolve; });
  const calls = [];
  Services.listAdminDishes = async (familyId, includeDeleted, sessionId) => {
    calls.push({ familyId, includeDeleted, sessionId });
    if (sessionId === 'LUNCH-session') return pendingLunch;
    return { items: [], total: 99, selectableCount: 9 };
  };
  Services.getReview = async () => ({ dishes: [], hasNoteUpdates: false });
  try {
    delete require.cache[require.resolve('../pages/admin-console/index.js')];
    require('../pages/admin-console/index.js');
    const page = { ...definition, route: 'pages/admin-console/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.onLoad();
    const lunch = page.onShow();
    await Promise.resolve();
    await Promise.resolve();
    page.onHide();
    app.globalData.selectedMealType = 'DINNER';
    await page.onShow();
    finishLunch({ items: [], total: 99, selectableCount: 4 });
    await lunch;
    assert.equal(page.data.totalDishesCount, 9);
    assert.deepEqual(calls.map(call => call.sessionId), ['LUNCH-session', 'DINNER-session']);
    assert.ok(calls.every(call => call.includeDeleted === false));
  } finally {
    Object.assign(Services, saved);
    delete global.Page;
  }
});

test('meal switch clears old count while loading and keeps unknown on failure', async () => {
  const saved = {
    listMyFamilies: Services.listMyFamilies,
    ensureSession: Services.ensureSession,
    listAdminDishes: Services.listAdminDishes,
    getReview: Services.getReview
  };
  const app = { globalData: { currentUser: { id: 'user-1' },
    activeFamily: { id: 'family-1', role: 'ADMIN' }, selectedMealType: 'LUNCH', sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { reLaunch() {}, switchTab() {}, showToast() {} };
  let definition;
  global.Page = value => { definition = value; };
  Services.listMyFamilies = async () => [app.globalData.activeFamily];
  Services.ensureSession = async (_familyId, _date, mealType) => ({ id: mealType + '-session', canSubmit: true });
  let finishDinner;
  const pendingDinner = new Promise(resolve => { finishDinner = resolve; });
  Services.listAdminDishes = async (_familyId, _includeDeleted, sessionId) =>
    sessionId === 'DINNER-session' ? pendingDinner : { items: [], total: 99, selectableCount: 4 };
  Services.getReview = async () => ({ dishes: [], hasNoteUpdates: false });
  try {
    delete require.cache[require.resolve('../pages/admin-console/index.js')];
    require('../pages/admin-console/index.js');
    const page = { ...definition, route: 'pages/admin-console/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.onLoad();
    await page.onShow();
    assert.equal(page.data.totalDishesCount, 4);
    page.onHide();
    app.globalData.selectedMealType = 'DINNER';
    const dinner = page.onShow();
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(page.data.currentMealType, 'DINNER');
    assert.equal(page.data.totalDishesCount, null);
    finishDinner({ items: [], total: 99 });
    await dinner;
    assert.equal(page.data.totalDishesCount, null);
    assert.equal(page.data.sessionStatusText, '加载失败');
  } finally {
    Object.assign(Services, saved);
    delete global.Page;
  }
});
