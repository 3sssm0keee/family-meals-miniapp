const test = require('node:test');
const assert = require('node:assert/strict');

const Services = require('../api/services.js');
const registerPage = require('../api/page.js');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function setup(loadWork) {
  const navigation = [];
  const app = { globalData: {
    currentUser: { id: 'user-1' }, activeFamily: { id: 'family-1', role: 'ADMIN' },
    currentSession: null, sessionRevision: 0
  } };
  global.getApp = () => app;
  global.wx = {
    reLaunch: value => navigation.push(['reLaunch', value.url]),
    switchTab: value => navigation.push(['switchTab', value.url])
  };
  let loaded = 0, shown = 0;
  const definition = registerPage({
    data: { members: [] },
    onLoad() { loaded++; return loadWork && loadWork(); },
    onShow() { shown++; }
  });
  const page = { ...definition, route: 'pages/admin-members/index', data: { ...definition.data } };
  page.setData = value => { page.data = { ...page.data, ...value }; };
  return { app, page, navigation, counts: () => ({ loaded, shown }) };
}

test('management content waits for a fresh administrator check and clears on revocation', async () => {
  const original = Services.listMyFamilies;
  const first = deferred();
  Services.listMyFamilies = () => first.promise;
  try {
    const { page, navigation, counts } = setup();
    page.onLoad({ from: 'old-link' });
    assert.equal(page.data.adminAccessState, 'checking');
    assert.equal(counts().loaded, 0);
    const showing = page.onShow();
    assert.equal(counts().shown, 0);
    first.resolve([{ id: 'family-1', role: 'ADMIN' }]);
    await showing;
    assert.equal(page.data.adminAccessState, 'ready');
    assert.deepEqual(counts(), { loaded: 1, shown: 1 });
    page.setData({ members: ['private member'] });

    Services.listMyFamilies = async () => [{ id: 'family-1', role: 'MEMBER' }];
    await page.onShow();
    assert.equal(page.data.adminAccessState, 'denied');
    assert.deepEqual(page.data.members, []);
    assert.deepEqual(navigation.at(-1), ['switchTab', '/pages/index/index']);
    assert.equal(counts().shown, 1);
  } finally { Services.listMyFamilies = original; }
});

test('response from a hidden page cannot reopen management content', async () => {
  const original = Services.listMyFamilies;
  const pending = deferred();
  Services.listMyFamilies = () => pending.promise;
  try {
    const { page, counts } = setup();
    page.onLoad();
    const showing = page.onShow();
    page.onHide();
    pending.resolve([{ id: 'family-1', role: 'ADMIN' }]);
    await showing;
    assert.equal(page.data.adminAccessState, 'checking');
    assert.deepEqual(counts(), { loaded: 0, shown: 0 });
  } finally { Services.listMyFamilies = original; }
});

test('invalid family role cannot enter the shared dishes tab', () => {
  const { app, page, navigation, counts } = setup();
  app.globalData.activeFamily.role = 'UNKNOWN';
  page.route = 'pages/admin-dishes/index';
  page.onShow();
  assert.deepEqual(navigation.at(-1), ['reLaunch', '/pages/family-select/index']);
  assert.equal(counts().shown, 0);
});

test('hiding during asynchronous onLoad prevents a late onShow', async () => {
  const original = Services.listMyFamilies;
  const pendingLoad = deferred();
  Services.listMyFamilies = async () => [{ id: 'family-1', role: 'ADMIN' }];
  try {
    const { page, counts } = setup(() => pendingLoad.promise);
    page.onLoad();
    const showing = page.onShow();
    await Promise.resolve();
    assert.equal(counts().loaded, 1);
    page.onHide();
    pendingLoad.resolve();
    await showing;
    assert.equal(page.data.adminAccessState, 'checking');
    assert.equal(counts().shown, 0);
  } finally { Services.listMyFamilies = original; }
});
