const test = require('node:test');
const assert = require('node:assert/strict');

const Services = require('../api/services.js');

test('shared dishes tab clears administrator data after role revocation', async () => {
  const saved = {
    listMyFamilies: Services.listMyFamilies,
    listAdminDishes: Services.listAdminDishes,
    listDishes: Services.listDishes
  };
  const app = { globalData: { currentUser: { id: 'user-1' },
    activeFamily: { id: 'family-1', role: 'ADMIN' },
    currentSession: { id: 'session-1' }, sessionRevision: 0 } };
  app.initSession = async () => { app.globalData.currentSession = { id: 'session-1' }; };
  global.getApp = () => app;
  global.wx = { reLaunch() {}, switchTab() {}, showToast() {} };
  let definition;
  global.Page = value => { definition = value; };
  let finishAdmin;
  const pendingAdmin = new Promise(resolve => { finishAdmin = resolve; });
  Services.listMyFamilies = async () => [{ id: 'family-1', role: app.globalData.activeFamily.role }];
  Services.listAdminDishes = () => pendingAdmin;
  Services.listDishes = async () => ({ items: [{ id: 'member-dish', name: '可点菜' }], total: 1 });
  try {
    delete require.cache[require.resolve('../pages/admin-dishes/index.js')];
    require('../pages/admin-dishes/index.js');
    const page = { ...definition, route: 'pages/admin-dishes/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.onLoad();
    const first = page.onShow();
    await Promise.resolve();
    await Promise.resolve();
    page.setData({ showVariantModal: true, currentDish: { id: 'admin-only' }, selectedVariantId: 'variant-1' });
    page.onHide();
    assert.equal(page.data.showVariantModal, false);
    assert.equal(page.data.currentDish, null);
    app.globalData.activeFamily.role = 'MEMBER';
    app.globalData.currentSession = { id: 'session-1' };
    await page.onShow();
    finishAdmin({ items: [{ id: 'admin-only', name: '停售菜' }], total: 1 });
    await first;
    assert.equal(page.data.isAdmin, false);
    assert.deepEqual(page.data.allDishes.map(dish => dish.id), ['member-dish']);
    assert.equal(page.data.currentDish, null);

    page.onHide();
    app.globalData.activeFamily.role = 'ADMIN';
    Services.listMyFamilies = async () => { throw new Error('身份网络失败'); };
    page.setData({ showVariantModal: true, currentDish: { id: 'stale-admin-dish' } });
    await page.onShow();
    assert.equal(page.data.isAdmin, false);
    assert.equal(page.data.showVariantModal, false);
    assert.equal(page.data.currentDish, null);
    assert.equal(page.data.roleError, '身份网络失败');
  } finally {
    Object.assign(Services, saved);
    delete global.Page;
  }
});
