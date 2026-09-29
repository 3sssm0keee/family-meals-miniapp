const test = require('node:test');
const assert = require('node:assert/strict');

const Services = require('../api/services.js');
const util = require('../utils/util.js');

test('member page loads all pages and separates expired guests for administrator action', async () => {
  const originalFamilies = Services.listMyFamilies;
  const originalMembers = Services.listMembers;
  const pages = [];
  const app = { globalData: { currentUser: { id: 'user-1' },
    activeFamily: { id: 'family-1', role: 'ADMIN' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { reLaunch() {}, switchTab() {}, showToast() {} };
  global.Page = definition => { pages.push(definition); };
  Services.listMyFamilies = async () => [{ id: 'family-1', role: 'ADMIN' }];
  const joinedAt = '2026-09-22T16:30:00.000Z';
  const first = Array.from({ length: 100 }, (_, index) => ({
    id: `member-${index}`, displayName: `成员${index}`, role: 'MEMBER',
    status: 'ACTIVE', joinedAt, accessExpiresAt: null
  }));
  const expiredGuest = { id: 'guest-1', displayName: '访客', role: 'GUEST',
    status: 'ACTIVE', joinedAt, accessExpiresAt: '2020-01-01T00:00:00.000Z' };
  Services.listMembers = async (_familyId, page) => {
    pages.push(page);
    return { items: page === 1 ? first : [expiredGuest], total: 101 };
  };
  try {
    delete require.cache[require.resolve('../pages/admin-members/index.js')];
    require('../pages/admin-members/index.js');
    const definition = pages.shift();
    const page = { ...definition, route: 'pages/admin-members/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.onLoad();
    await page.onShow();
    assert.deepEqual(pages, [1, 2]);
    assert.equal(page.data.members.length, 100);
    assert.equal(page.data.pendingGuests.length, 1);
    assert.equal(page.data.pendingGuests[0].joinedAtText, '2026-09-23 00:30');
    assert.equal(util.formatBeijingDateTime('invalid'), '');
  } finally {
    Services.listMyFamilies = originalFamilies;
    Services.listMembers = originalMembers;
    delete global.Page;
  }
});

test('late member response from another family cannot replace current family members', async () => {
  const originalFamilies = Services.listMyFamilies;
  const originalMembers = Services.listMembers;
  let finishOld;
  const oldResponse = new Promise(resolve => { finishOld = resolve; });
  const app = { globalData: { currentUser: { id: 'user-1' },
    activeFamily: { id: 'family-A', role: 'ADMIN' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { reLaunch() {}, switchTab() {}, showToast() {} };
  let definition;
  global.Page = value => { definition = value; };
  Services.listMyFamilies = async () => [app.globalData.activeFamily];
  Services.listMembers = familyId => familyId === 'family-A' ? oldResponse : Promise.resolve({
    items: [{ id: 'B-member', role: 'MEMBER', status: 'ACTIVE', displayName: 'B', joinedAt: '2026-09-22T00:00:00Z' }], total: 1
  });
  try {
    delete require.cache[require.resolve('../pages/admin-members/index.js')];
    require('../pages/admin-members/index.js');
    const page = { ...definition, route: 'pages/admin-members/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.onLoad();
    const first = page.onShow();
    await Promise.resolve();
    page.onHide();
    app.globalData.activeFamily = { id: 'family-B', role: 'ADMIN' };
    await page.onShow();
    finishOld({ items: [{ id: 'A-member', role: 'MEMBER', status: 'ACTIVE', displayName: 'A' }], total: 1 });
    await first;
    assert.equal(page.data.adminAccessState, 'ready');
    assert.deepEqual(page.data.members.map(member => member.id), ['B-member']);
  } finally {
    Services.listMyFamilies = originalFamilies;
    Services.listMembers = originalMembers;
    delete global.Page;
  }
});

test('duplicate pages fail visibly instead of reporting an incomplete roster', async () => {
  const originalFamilies = Services.listMyFamilies;
  const originalMembers = Services.listMembers;
  const app = { globalData: { currentUser: { id: 'user-1' },
    activeFamily: { id: 'family-1', role: 'ADMIN' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { reLaunch() {}, switchTab() {}, showToast() {} };
  let definition;
  global.Page = value => { definition = value; };
  Services.listMyFamilies = async () => [app.globalData.activeFamily];
  const pages = [];
  Services.listMembers = async (_familyId, page) => {
    pages.push(page);
    return { items: page < 3 ? [{ id: 'member-A', role: 'MEMBER', status: 'ACTIVE' }] : [], total: 2 };
  };
  try {
    delete require.cache[require.resolve('../pages/admin-members/index.js')];
    require('../pages/admin-members/index.js');
    const page = { ...definition, route: 'pages/admin-members/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.onLoad();
    await page.onShow();
    assert.deepEqual(pages, [1, 2, 3]);
    assert.deepEqual(page.data.members, []);
    assert.match(page.data.error, /发生变化/);
  } finally {
    Services.listMyFamilies = originalFamilies;
    Services.listMembers = originalMembers;
    delete global.Page;
  }
});

test('failed load after switching families never shows the old family roster', async () => {
  const originalFamilies = Services.listMyFamilies;
  const originalMembers = Services.listMembers;
  const app = { globalData: { currentUser: { id: 'user-1' },
    activeFamily: { id: 'family-A', role: 'ADMIN' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { reLaunch() {}, switchTab() {}, showToast() {} };
  let definition;
  global.Page = value => { definition = value; };
  Services.listMyFamilies = async () => [app.globalData.activeFamily];
  Services.listMembers = async familyId => {
    if (familyId === 'family-B') throw new Error('网络失败');
    return { items: [{ id: 'A-member', role: 'MEMBER', status: 'ACTIVE', joinedAt: '2026-09-22T00:00:00Z' }], total: 1 };
  };
  try {
    delete require.cache[require.resolve('../pages/admin-members/index.js')];
    require('../pages/admin-members/index.js');
    const page = { ...definition, route: 'pages/admin-members/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.onLoad();
    await page.onShow();
    assert.deepEqual(page.data.members.map(member => member.id), ['A-member']);
    page.onHide();
    app.globalData.activeFamily = { id: 'family-B', role: 'ADMIN' };
    await page.onShow();
    assert.equal(page.data.adminAccessState, 'ready');
    assert.deepEqual(page.data.members, []);
    assert.deepEqual(page.data.pendingGuests, []);
    assert.equal(page.data.error, '网络失败');
  } finally {
    Services.listMyFamilies = originalFamilies;
    Services.listMembers = originalMembers;
    delete global.Page;
  }
});
