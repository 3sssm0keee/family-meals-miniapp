// 小程序入口生命周期与全局状态管理
const Services = require('./api/services.js');
const { setActiveFamily } = require('./api/request.js');
const CONFIG = require('./config.js');
const transport = require('./api/transport.js');
const { setAuthToken } = require('./api/request.js');
const util = require('./utils/util.js');
const mealContext = require('./api/session-context.js');

App({
  globalData: {
    currentUser: CONFIG.USE_MOCK ? { id: "user_zhang", displayName: "张三" } : null,
    activeFamily: CONFIG.USE_MOCK ? { id: "fam_1", name: "幸福三叶草之家", role: "ADMIN" } : null,
    currentSession: null,
    selectedMealType: 'LUNCH',
    sessionRevision: 0,
    cartCount: 0
  },

  onLaunch() {
    console.log('[FamilyMeal] ' + (CONFIG.USE_MOCK ? '离线演示模式' : '云托管测试版'));
    if (CONFIG.USE_MOCK) this.initSession();
    transport.onExpired(() => { this.login(true).catch(() => { wx.showToast({title: '登录已过期，请保留草稿后重新登录', icon: 'none'}); }); });
  },

  async login(recover = false, deferNavigation = false) {
    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = (async () => {
      const oldUser = this.globalData.currentUser && this.globalData.currentUser.id;
      const oldFamily = this.globalData.activeFamily;
      const oldSession = this.globalData.currentSession;
      mealContext.invalidate(this);
      setAuthToken(null);
      this.globalData.currentUser = null;
      this.globalData.activeFamily = null;
      this.globalData.currentSession = null;
      setActiveFamily(null, null);
      const code = await new Promise((resolve, reject) => wx.login({success: r => r.code ? resolve(r.code) : reject(new Error('微信登录未返回code')), fail: reject}));
      const result = await Services.login(code);
      setAuthToken(result.token);
      this.globalData.currentUser = result.user;
      const memberships = await Services.listMyFamilies();
      this.globalData.accessExpired = memberships.some(f => f.accessExpiresAt && Date.parse(f.accessExpiresAt)<=Date.now());
      const families = memberships.filter(f => !f.accessExpiresAt || Date.parse(f.accessExpiresAt)>Date.now());
      this.globalData.families = families;
      if (deferNavigation) return result;
      const restored = recover && oldUser === result.user.id && oldFamily && families.find(f => f.id === oldFamily.id);
      if (restored) {
        this.globalData.activeFamily = restored;
        this.globalData.currentSession = oldSession;
        setActiveFamily(restored.id, restored.role);
        const pages = typeof getCurrentPages === 'function' ? getCurrentPages() : [];
        const page = pages[pages.length - 1];
        // Reload reads after recovery; never replay a failed write automatically.
        if (page && typeof page.onAuthRecovered === 'function') {
          Promise.resolve().then(() => page.onAuthRecovered()).catch(() => {
            wx.showToast({ title: '登录已恢复，请重新加载页面', icon: 'none' });
          });
        }
        return result;
      }
      if (oldUser && oldUser !== result.user.id) this.globalData.cartCount = 0;
      if (families.length === 1 && !this.globalData.pendingInvite) {
        this.enterFamily(families[0]);
      } else {
        wx.reLaunch({url: '/pages/family-select/index'});
      }
      return result;
    })();
    try { return await this.loginPromise; } finally { this.loginPromise = null; }
  },

  enterFamily(family) {
    if (!family || !family.id || !['ADMIN','MEMBER','GUEST'].includes(family.role)) throw new Error('家庭身份无效');
    if (family.accessExpiresAt && Date.parse(family.accessExpiresAt)<=Date.now()) {
      mealContext.invalidate(this);
      this.globalData.accessExpired=true;
      this.globalData.activeFamily=null;
      wx.reLaunch({url:'/pages/family-select/index'});return;
    }
    mealContext.invalidate(this);
    this.globalData.selectedMealType = 'LUNCH';
    this.globalData.accessExpired=false;
    this.globalData.activeFamily = family;
    this.globalData.currentSession = null;
    this.globalData.cartCount = 0;
    setActiveFamily(family.id, family.role);
    wx.reLaunch({url: '/pages/index/index'});
  },

  // 初始化当前家庭与当天餐次
  async initSession() {
    if (!this.globalData.activeFamily) return;
    try {
      setActiveFamily(this.globalData.activeFamily.id, this.globalData.activeFamily.role);
      const today = util.formatDate(new Date());
      return await mealContext.select(this, today, this.globalData.selectedMealType || 'LUNCH');
    } catch (e) {
      console.error('[initSession error]', e);
    }
  },

  // 刷新购物车数量计数
  async updateCartCount() {
    const context = mealContext.capture(this);
    if (!context.sessionId || !context.familyId) return;
    try {
      const cart = await Services.getCart(context.familyId, context.sessionId);
      if (!mealContext.isCurrent(this, context)) return;
      this.globalData.cartCount = cart.items ? cart.items.length : 0;
    } catch (e) {
      console.error('[updateCartCount error]', e);
    }
  }
});
