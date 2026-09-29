const app = getApp();
const Services = require('../../api/services.js');
const mealContext = require('../../api/session-context.js');

Page(require('../../api/page.js')({
  data: {
    cartItems: [],
    submitting: false,
    personalMenu: null,
    canAppend: false,
    loadedSessionId: null,
    loading: false,
    loadError: ''
  },

  onAuthRecovered() { return this.loadCart(); },

  onShow() {
    this.loadCart();
  },

  onUnload() { this.loadRequest = (this.loadRequest || 0) + 1; this.loadedContext = null; },

  onRetry() { return this.loadCart(); },

  async loadCart() {
    const requestId = this.loadRequest = (this.loadRequest || 0) + 1;
    const identity = mealContext.capture(app);
    let context = null;
    this.loadedContext = null;
    this.setData({ loading: true, loadError: '', loadedSessionId: null, cartItems: [], personalMenu: null, canAppend: false });
    const active = () => this.loadRequest === requestId && mealContext.sameIdentity(app, identity) &&
      (!context || mealContext.isCurrent(app, context));
    try {
      if (!app.globalData.currentSession) await app.initSession();
      if (!active()) return;
      context = mealContext.capture(app);
      if (!context.sessionId) throw new Error('餐次未载入，请回首页重试');
      const [cart, personalMenu, session] = await Promise.all([
        Services.getCart(context.familyId, context.sessionId),
        Services.getPersonalMenu(context.familyId, context.sessionId),
        Services.getSession(context.familyId, context.sessionId)
      ]);
      if (!active()) return;
      this.loadedContext = context;
      this.setData({ cartItems: cart.items || [], personalMenu, canAppend: session.canAppend === true,
        loadedSessionId: context.sessionId });
    } catch (e) {
      if (active()) this.setData({ loadError: e.message || '加载失败，请重试' });
    } finally {
      if (this.loadRequest === requestId) this.setData({ loading: false });
    }
  },

  currentWriteContext() {
    if (!this.data.loading && mealContext.isCurrent(app, this.loadedContext)) return this.loadedContext;
    wx.showToast({ title: '餐次已切换或尚未载入，请重新载入选择', icon: 'none' });
    return null;
  },

  async onRemoveItem(e) {
    if (this.data.submitting) return;
    const context = this.currentWriteContext();
    if (!context) return;
    const variantId = e.currentTarget.dataset.id;
    this.setData({ submitting: true });
    try {
      await Services.removeCartItem(context.familyId, context.sessionId, variantId);
      if (!mealContext.isCurrent(app, context)) return;
      await this.loadCart();
      if (mealContext.isCurrent(app, context)) wx.showToast({ title: '已移除菜品', icon: 'none' });
    } catch (e) {
      if (mealContext.isCurrent(app, context)) wx.showToast({title:e.message || '移除失败',icon:'none'});
    } finally { this.setData({ submitting: false }); }
  },

  onStepperMinus(e) {
    const context = this.currentWriteContext();
    if (!context) return;
    wx.showModal({
      title: '移除这道菜？',
      content: '确定从今日我的选择中移除吗？',
      confirmColor: '#EE7B57',
      success: (res) => {
        if (res.confirm && mealContext.isCurrent(app, context)) {
          this.onRemoveItem(e);
        }
      }
    });
  },

  onStepperPlus(e) {
    wx.showToast({
      title: '每人每款一份，掌勺人会统筹分量哦~ ♡',
      icon: 'none',
      duration: 2000
    });
  },


  async onSubmit() {
    if (this.data.submitting || this.data.loading) return;
    const context = this.currentWriteContext();
    if (!context) return;
    if (!this.data.cartItems.length) {
      wx.showToast({ title: '尚未选择菜品', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    try {
      const variantIds = this.data.cartItems.map(i => i.variantId);
      const [personalMenu, session] = await Promise.all([
        Services.getPersonalMenu(context.familyId, context.sessionId),
        Services.getSession(context.familyId, context.sessionId)
      ]);
      if (!mealContext.isCurrent(app, context)) return;
      this.setData({ personalMenu, canAppend: session.canAppend === true });
      if (this.data.personalMenu) {
        if (!this.data.canAppend) throw new Error('本餐次暂不支持追加');
        await Services.appendMenu(context.familyId, context.sessionId, variantIds, this.data.personalMenu.version);
      } else {
        await Services.submitMenu(context.familyId, context.sessionId, variantIds, '');
      }
      if (!mealContext.isCurrent(app, context)) return;
      await this.loadCart();
      if (!mealContext.isCurrent(app, context)) return;
      wx.showToast({ title: '提交成功！期待开饭~ ♡', icon: 'success' });
      setTimeout(() => {
        if (mealContext.isCurrent(app, context)) wx.switchTab({ url: '/pages/family-menu/index' });
      }, 600);
    } catch (e) {
      if (!mealContext.isCurrent(app, context)) return;
      if (e.code === 'VERSION_CONFLICT' || e.code === 'ALREADY_SUBMITTED') {
        await this.loadCart();
        if (mealContext.isCurrent(app, context)) wx.showToast({ title: '点单已更新，选择已保留，请核对后重试', icon: 'none' });
        return;
      }
      wx.showToast({ title: e.message || '提交失败', icon: 'none' });
    } finally { this.setData({ submitting: false }); }
  }
}));
