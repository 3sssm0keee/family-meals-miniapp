const app = getApp();
const Services = require('../../api/services.js');
const mealContext = require('../../api/session-context.js');

Page(require('../../api/page.js')({
  data: {
    isAdmin: false,
    session: {},
    dishes: [],
    loading: false,
    loadError: ''
  },

  onAuthRecovered() { return this.loadFamilyMenu(); },

  onShow() {
    const fam = app.globalData.activeFamily || {};
    this.setData({
      isAdmin: fam.role === 'ADMIN'
    });
    this.loadFamilyMenu();
  },

  onPullDownRefresh() {
    this.loadFamilyMenu().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onRetry() { return this.loadFamilyMenu(); },

  onUnload() { this.loadRequest = (this.loadRequest || 0) + 1; },

  async loadFamilyMenu() {
    const requestId = this.loadRequest = (this.loadRequest || 0) + 1;
    const identity = mealContext.capture(app);
    let context = null;
    const active = () => this.loadRequest === requestId && mealContext.sameIdentity(app, identity) &&
      (!context || mealContext.isCurrent(app, context));
    this.setData({ loading: true, loadError: '', session: app.globalData.currentSession || {}, dishes: [] });
    try {
      if (!app.globalData.currentSession) await app.initSession();
      if (!active()) return;
      context = mealContext.capture(app);
      if (!context.sessionId) throw new Error('餐次未载入，请回首页重试');
      this.setData({ session: app.globalData.currentSession });
      const menu = await Services.getFamilyMenu(context.familyId, context.sessionId);
      if (!active()) return;
      if (!menu || menu.session.id !== context.sessionId) throw new Error('菜单载入不一致，请重试');
      this.setData({ session: menu.session, dishes: menu.dishes || [] });
    } catch (e) {
      if (active()) this.setData({ dishes: [], loadError: e.message || '菜单加载失败，请重试' });
    } finally {
      if (this.loadRequest === requestId) this.setData({ loading: false });
    }
  }
}));
