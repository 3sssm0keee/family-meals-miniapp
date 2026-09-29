const CONFIG = require('../config.js');
const Services = require('./services.js');
const { setActiveFamily } = require('./request.js');
const mealContext = require('./session-context.js');

function isAdminPage(route) {
  return !!route && route.startsWith('pages/admin-') && route !== 'pages/admin-dishes/index';
}

function validFamily(family) {
  return !!family && (!family.accessExpiresAt || Date.parse(family.accessExpiresAt) > Date.now());
}

// Route guards are presentation checks; the backend remains the authority.
module.exports = function registerPage(definition) {
  definition.data = { ...(definition.data || {}), useMock: CONFIG.USE_MOCK,
    adminAccessState: CONFIG.USE_MOCK ? 'ready' : 'checking' };
  if (!CONFIG.USE_MOCK) {
    for (const key of ['membersList', 'testMembers']) {
      if (key in definition.data) definition.data[key] = [];
    }
    for (const key of ['currentRole', 'currentMemberId', 'currentMemberName', 'unsubmittedNames']) {
      if (key in definition.data) definition.data[key] = '';
    }
    if ('isAdmin' in definition.data) definition.data.isAdmin = false;
    for (const key of ['totalMembers', 'submittedCount', 'unsubmittedCount', 'pendingReviewCount', 'totalDishesCount']) {
      if (key in definition.data) definition.data[key] = null;
    }
    for (const key of ['onSwitchRole', 'onSwitchToUserView', 'onSelectMember', 'onQuickSwitchMember', 'onToggleFavorite']) {
      if (definition[key]) definition[key] = function () {
        wx.showToast({ title: '当前版本暂不支持此功能', icon: 'none' });
      };
    }
    const initialData = { ...definition.data };
    const onLoad = definition.onLoad;
    const onShow = definition.onShow;
    const onHide = definition.onHide;
    const onUnload = definition.onUnload;
    const onAuthRecovered = definition.onAuthRecovered;
    function localAccess(page) {
      const state = getApp().globalData;
      if (page.route === 'pages/login/index') return true;
      if (!state.currentUser) { wx.reLaunch({ url: '/pages/login/index' }); return false; }
      if (page.route === 'pages/family-select/index') return true;
      if (!validFamily(state.activeFamily)) {
        if (state.activeFamily) state.accessExpired = true;
        state.activeFamily = null;
        mealContext.invalidate(getApp());
        setActiveFamily(null, null);
        wx.reLaunch({ url: '/pages/family-select/index' });
        return false;
      }
      if (!['ADMIN', 'MEMBER', 'GUEST'].includes(state.activeFamily.role)) {
        state.activeFamily = null;
        mealContext.invalidate(getApp());
        setActiveFamily(null, null);
        wx.reLaunch({ url: '/pages/family-select/index' });
        return false;
      }
      if (isAdminPage(page.route) && state.activeFamily.role !== 'ADMIN') {
        page.revokeAdminAccess();
        wx.switchTab({ url: '/pages/index/index' });
        return false;
      }
      return true;
    }
    definition.revokeAdminAccess = function () {
      this._adminAccessEpoch = (this._adminAccessEpoch || 0) + 1;
      this.setData({ ...initialData, adminAccessState: 'denied' });
    };
    definition.handleAdminError = function (error) {
      if (!error || !['FORBIDDEN', 'MEMBERSHIP_INACTIVE'].includes(error.code)) return false;
      this.revokeAdminAccess();
      this.refreshAdminAccess();
      return true;
    };
    definition.captureAdminAccess = function () {
      const state = getApp().globalData;
      if (this.data.adminAccessState !== 'ready' || !state.currentUser ||
          !state.activeFamily || state.activeFamily.role !== 'ADMIN') return null;
      return { epoch: this._adminAccessEpoch, userId: state.currentUser.id,
        familyId: state.activeFamily.id };
    };
    definition.isAdminAccessCurrent = function (access) {
      const state = getApp().globalData;
      return !!access && this.data.adminAccessState === 'ready' &&
        this._adminAccessEpoch === access.epoch && !!state.currentUser &&
        state.currentUser.id === access.userId && !!state.activeFamily &&
        state.activeFamily.id === access.familyId && state.activeFamily.role === 'ADMIN';
    };
    definition.refreshAdminAccess = async function () {
      if (!isAdminPage(this.route) || !localAccess(this)) return;
      const app = getApp();
      const userId = app.globalData.currentUser.id;
      const familyId = app.globalData.activeFamily.id;
      const epoch = this._adminAccessEpoch = (this._adminAccessEpoch || 0) + 1;
      this.setData({ adminAccessState: 'checking' });
      try {
        const families = await Services.listMyFamilies();
        if (epoch !== this._adminAccessEpoch || !app.globalData.currentUser ||
            app.globalData.currentUser.id !== userId ||
            !app.globalData.activeFamily || app.globalData.activeFamily.id !== familyId) return;
        const current = (families || []).find(f => f.id === familyId);
        if (!validFamily(current) || current.role !== 'ADMIN') {
          if (current && validFamily(current)) {
            app.globalData.activeFamily = current;
            setActiveFamily(current.id, current.role);
          } else {
            app.globalData.activeFamily = null;
            setActiveFamily(null, null);
          }
          mealContext.invalidate(app);
          this.revokeAdminAccess();
          if (app.globalData.activeFamily) wx.switchTab({ url: '/pages/index/index' });
          else wx.reLaunch({ url: '/pages/family-select/index' });
          return;
        }
        app.globalData.activeFamily = current;
        setActiveFamily(current.id, current.role);
        this.setData({ adminAccessState: 'ready' });
        if (!this._adminLoadDone) {
          if (onLoad) await onLoad.apply(this, this._adminLoadArgs || []);
          if (epoch !== this._adminAccessEpoch || this.data.adminAccessState !== 'ready' ||
              !app.globalData.currentUser || app.globalData.currentUser.id !== userId ||
              !app.globalData.activeFamily || app.globalData.activeFamily.id !== familyId ||
              app.globalData.activeFamily.role !== 'ADMIN') return;
          this._adminLoadDone = true;
        }
        if (onShow) return onShow.call(this);
      } catch (error) {
        if (epoch !== this._adminAccessEpoch) return;
        this.setData({ adminAccessState: 'error' });
      }
    };
    definition.onLoad = function (...args) {
      if (!localAccess(this)) return;
      if (isAdminPage(this.route)) { this._adminLoadArgs = args; return; }
      return onLoad && onLoad.apply(this, args);
    };
    definition.onShow = function (...args) {
      if (!localAccess(this)) return;
      if (isAdminPage(this.route)) return this.refreshAdminAccess();
      return onShow && onShow.apply(this, args);
    };
    definition.onHide = function (...args) {
      if (isAdminPage(this.route)) {
        this._adminAccessEpoch = (this._adminAccessEpoch || 0) + 1;
        this.setData({ adminAccessState: 'checking' });
      }
      return onHide && onHide.apply(this, args);
    };
    definition.onUnload = function (...args) {
      if (isAdminPage(this.route)) {
        this._adminAccessEpoch = (this._adminAccessEpoch || 0) + 1;
        this.setData({ adminAccessState: 'checking' });
      }
      return onUnload && onUnload.apply(this, args);
    };
    if (onAuthRecovered) definition.onAuthRecovered = function (...args) {
      if (isAdminPage(this.route)) return this.refreshAdminAccess();
      return onAuthRecovered.apply(this, args);
    };
  }
  return definition;
};
