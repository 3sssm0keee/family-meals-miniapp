const test = require('node:test');
const assert = require('node:assert/strict');

const Services = require('../api/services.js');

test('a user without a nickname starts with the editor open', () => {
  const app = { globalData: { currentUser: { id: 'user-empty', displayName: '' } } };
  global.getApp = () => app;
  global.wx = { showToast() {} };
  let definition;
  global.Page = value => { definition = value; };
  try {
    delete require.cache[require.resolve('../pages/index/index.js')];
    require('../pages/index/index.js');
    const page = { ...definition, data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.syncNickname();
    assert.equal(page.data.nicknameEditing, true);
    page.onCancelNicknameEdit();
    assert.equal(page.data.nicknameEditing, true);
  } finally { delete global.Page; }
});

test('nickname save keeps the draft on failure and updates it only after success', async () => {
  const original = Services.updateMe;
  const app = { globalData: { currentUser: { id: 'user-1', displayName: '旧昵称' },
    activeFamily: { id: 'family-1', role: 'MEMBER', memberId: 'member-1' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { showToast() {}, reLaunch() {}, switchTab() {} };
  let definition;
  global.Page = value => { definition = value; };
  try {
    delete require.cache[require.resolve('../pages/index/index.js')];
    require('../pages/index/index.js');
    const page = { ...definition, route: 'pages/index/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.syncNickname();
    assert.equal(page.data.nicknameEditing, false);
    page.onEditNickname();
    page.onNicknameInput({ detail: { value: '新昵称' } });
    Services.updateMe = async () => { throw new Error('暂时不可用'); };
    await page.onSaveNickname();
    assert.equal(page.data.nicknameDraft, '新昵称');
    assert.equal(page.data.nicknameSaved, '旧昵称');
    assert.equal(page.data.nicknameError, '暂时不可用');
    assert.equal(page.data.nicknameEditing, true);

    Services.updateMe = async name => ({ id: 'user-1', displayName: name });
    await page.onSaveNickname();
    assert.equal(page.data.nicknameSaved, '新昵称');
    assert.equal(page.data.nicknameDirty, false);
    assert.equal(page.data.nicknameEditing, false);
    assert.equal(app.globalData.currentUser.displayName, '新昵称');
    page.onEditNickname();
    assert.equal(page.data.nicknameEditing, true);
    page.onCancelNicknameEdit();
    assert.equal(page.data.nicknameEditing, false);
    assert.equal(page.data.nicknameDraft, '新昵称');
  } finally {
    Services.updateMe = original;
    delete global.Page;
  }
});

test('old user save cannot lock or overwrite a new user save', async () => {
  const original = Services.updateMe;
  const app = { globalData: { currentUser: { id: 'user-A', displayName: 'A原名' },
    activeFamily: { id: 'family-1', role: 'MEMBER', memberId: 'member-A' }, sessionRevision: 0 } };
  global.getApp = () => app;
  global.wx = { showToast() {}, reLaunch() {}, switchTab() {} };
  let definition;
  global.Page = value => { definition = value; };
  let finishA, finishB;
  Services.updateMe = name => new Promise(resolve => {
    if (name === 'A新名') finishA = resolve;
    else finishB = resolve;
  });
  try {
    delete require.cache[require.resolve('../pages/index/index.js')];
    require('../pages/index/index.js');
    const page = { ...definition, route: 'pages/index/index', data: { ...definition.data } };
    page.setData = value => { page.data = { ...page.data, ...value }; };
    page.syncNickname();
    page.onEditNickname();
    page.onNicknameInput({ detail: { value: 'A新名' } });
    const saveA = page.onSaveNickname();
    assert.equal(page.data.nicknameSaving, true);

    app.globalData.currentUser = { id: 'user-B', displayName: 'B原名' };
    page.syncNickname();
    assert.equal(page.data.nicknameSaving, false);
    assert.equal(page.data.nicknameDraft, 'B原名');
    assert.equal(page.data.nicknameEditing, false);
    page.onEditNickname();
    page.onNicknameInput({ detail: { value: 'B新名' } });
    const saveB = page.onSaveNickname();
    finishA({ id: 'user-A', displayName: 'A新名' });
    await saveA;
    assert.equal(page.data.nicknameSaving, true);
    assert.equal(page.data.nicknameDraft, 'B新名');
    finishB({ id: 'user-B', displayName: 'B新名' });
    await saveB;
    assert.equal(page.data.nicknameSaving, false);
    assert.equal(page.data.nicknameSaved, 'B新名');
    assert.equal(page.data.nicknameEditing, false);
  } finally {
    Services.updateMe = original;
    delete global.Page;
  }
});
