const test = require('node:test');
const assert = require('node:assert/strict');

const Services = require('../api/services.js');

test('audit response from another family stays hidden after switching families', async () => {
  const originalFamilies = Services.listMyFamilies;
  const originalOperations = Services.listOperations;
  let finishOld;
  const oldResponse = new Promise(resolve => { finishOld = resolve; });
  const app = { globalData: { currentUser: { id: 'user-1' },
    activeFamily: { id: 'family-A', role: 'ADMIN' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { reLaunch() {}, switchTab() {}, showToast() {} };
  let definition;
  global.Page = value => { definition = value; };
  Services.listMyFamilies = async () => [app.globalData.activeFamily];
  Services.listOperations = familyId => familyId === 'family-A' ? oldResponse :
    Promise.resolve({ items: [{ id: 'B-operation', action: 'DISH_CREATE',
      summary: '添加菜品「新菜」', createdAt: '2026-09-22T16:30:00Z' }], total: 1 });
  try {
    delete require.cache[require.resolve('../pages/admin-audit/index.js')];
    require('../pages/admin-audit/index.js');
    const page = { ...definition, route: 'pages/admin-audit/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.onLoad();
    const first = page.onShow();
    await Promise.resolve();
    page.onHide();
    app.globalData.activeFamily = { id: 'family-B', role: 'ADMIN' };
    await page.onShow();
    finishOld({ items: [{ id: 'A-operation' }], total: 1 });
    await first;
    assert.equal(page.data.adminAccessState, 'ready');
    assert.deepEqual(page.data.operations.map(item => item.id), ['B-operation']);
    assert.equal(page.data.operations[0].summaryText, '添加菜品「新菜」');
    assert.equal(page.data.operations[0].createdAtText, '2026-09-23 00:30');
  } finally {
    Services.listMyFamilies = originalFamilies;
    Services.listOperations = originalOperations;
    delete global.Page;
  }
});
