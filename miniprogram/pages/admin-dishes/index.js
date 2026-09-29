const app = getApp();
const Services = require('../../api/services.js');
const mealContext = require('../../api/session-context.js');
const { getCurrentMember, setActiveFamily } = require('../../api/request.js');

Page(require('../../api/page.js')({
  ...require('../../api/item-notes.js').choiceHandlers(app),
  data: {
    isAdmin: false,
    loading: false,
    allDishes: [],
    filteredDishes: [],
    searchKeyword: '',
    categories: ['全部'],
    activeCategory: '全部',

    // 规格选择浮层状态 (对标图 2 & 3)
    showVariantModal: false,
    currentDish: null,
    selectedVariantId: '',
    dishNote: ''
  },

  onAuthRecovered() { return this.loadDishes(); },

  async onShow() {
    const roleSeq = this.roleCheckSeq = (this.roleCheckSeq || 0) + 1;
    this.loadRequest = (this.loadRequest || 0) + 1;
    const identity = mealContext.capture(app);
    const cur = getCurrentMember ? getCurrentMember() : null;
    const role = (cur && cur.role) || (app.globalData.activeFamily && app.globalData.activeFamily.role);
    this.loadedContext = null;
    this.setData({ isAdmin: false, allDishes: [], filteredDishes: [], roleError: '', loading: true,
      showVariantModal: false, currentDish: null, selectedVariantId: '', dishNote: '' });
    if (role !== 'ADMIN' || this.data.useMock) {
      this.setData({ isAdmin: role === 'ADMIN' });
      return this.loadDishes();
    }
    try {
      const families = await Services.listMyFamilies();
      if (roleSeq !== this.roleCheckSeq || !mealContext.sameIdentity(app, identity)) return;
      const current = (families || []).find(family => family.id === identity.familyId);
      if (!current || !['ADMIN', 'MEMBER', 'GUEST'].includes(current.role) ||
          current.accessExpiresAt && Date.parse(current.accessExpiresAt) <= Date.now()) {
        app.globalData.activeFamily = null;
        setActiveFamily(null, null);
        mealContext.invalidate(app);
        wx.reLaunch({ url: '/pages/family-select/index' });
        return;
      }
      if (current.role !== role) mealContext.invalidate(app);
      app.globalData.activeFamily = current;
      setActiveFamily(current.id, current.role);
      this.setData({ isAdmin: current.role === 'ADMIN' });
      return this.loadDishes();
    } catch (error) {
      if (roleSeq === this.roleCheckSeq && mealContext.sameIdentity(app, identity)) {
        this.setData({ roleError: error.message || '身份核验失败，请重试', loading: false });
      }
    }
  },

  async loadDishes() {
    const request = this.loadRequest = (this.loadRequest || 0) + 1;
    const identity = mealContext.capture(app);
    let context = null;
    const active = () => request === this.loadRequest && mealContext.sameIdentity(app, identity) && (!context || mealContext.isCurrent(app, context));
    this.loadedContext = null;
    this.setData({ loading: true, allDishes: [], filteredDishes: [], showVariantModal: false, currentDish: null });
    try {
      if (!app.globalData.currentSession) await app.initSession();
      if (!active()) return;
      if (!app.globalData.currentSession) throw new Error('餐次未载入，请回首页重试');
      context = mealContext.capture(app);
      const res = this.data.isAdmin
        ? await Services.listAdminDishes(context.familyId, false)
        : await Services.listDishes(context.familyId, context.sessionId);
      if (!active()) return;
      const allDishes = res.items || [];
      this.loadedContext = context;
      this.setData({ allDishes });
      this.applyFilter();
    } catch (e) {
      if (!active()) return;
      if (this.data.isAdmin && ['FORBIDDEN', 'MEMBERSHIP_INACTIVE'].includes(e.code)) {
        this.setData({ isAdmin: false, allDishes: [], filteredDishes: [] });
        return this.onShow();
      }
      this.setData({ allDishes: [], filteredDishes: [] });
      wx.showToast({title: e.message || '菜品加载失败', icon: 'none'});
    } finally {
      if (request === this.loadRequest) this.setData({ loading: false });
    }
  },

  onHide() {
    this.roleCheckSeq = (this.roleCheckSeq || 0) + 1;
    this.loadRequest = (this.loadRequest || 0) + 1;
    this.loadedContext = null;
    this.setData({ isAdmin: false, allDishes: [], filteredDishes: [],
      showVariantModal: false, currentDish: null, selectedVariantId: '', dishNote: '' });
  },
  onUnload() {
    this.roleCheckSeq = (this.roleCheckSeq || 0) + 1;
    this.loadRequest = (this.loadRequest || 0) + 1;
    this.loadedContext = null;
    this.setData({ showVariantModal: false, currentDish: null, selectedVariantId: '', dishNote: '' });
  },

  currentWriteContext() {
    if (!this.data.isAdmin || !app.globalData.activeFamily || app.globalData.activeFamily.role !== 'ADMIN') {
      wx.showToast({ title: '当前家庭身份没有管理权限', icon: 'none' });
      return null;
    }
    if (!this.data.loading && mealContext.isCurrent(app, this.loadedContext)) return this.loadedContext;
    wx.showToast({ title: '餐次已变更，请重新加载菜品', icon: 'none' });
    return null;
  },

  applyFilter() {
    const { allDishes, activeCategory, searchKeyword } = this.data;
    const kw = (searchKeyword || '').trim().toLowerCase();

    const filtered = allDishes.filter(dish => {
      // 检查分类匹配
      const matchCategory = activeCategory === '全部' || dish.category === activeCategory;
      // 检查搜索关键字
      const matchKeyword = !kw || 
        (dish.name && dish.name.toLowerCase().includes(kw)) || 
        (dish.description && dish.description.toLowerCase().includes(kw)) ||
        (dish.tag && dish.tag.toLowerCase().includes(kw));

      return matchCategory && matchKeyword;
    });

    this.setData({ filteredDishes: filtered });
  },

  onCategoryChange(e) {
    const category = e.currentTarget.dataset.category;
    this.setData({ activeCategory: category }, () => {
      this.applyFilter();
    });
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value }, () => {
      this.applyFilter();
    });
  },

  onSearchConfirm() {
    this.applyFilter();
  },

  onClearSearch() {
    this.setData({ searchKeyword: '' }, () => {
      this.applyFilter();
    });
  },
  onPreventClose() {},

  onEditDish(e) {
    if (!this.currentWriteContext()) return;
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/admin-dish-edit/index?id=${id}`
    });
  },

  async onPromote(e) {
    const context = this.currentWriteContext();
    if (!context) return;
    const { id, version } = e.currentTarget.dataset;
    try {
      await Services.promoteDish(context.familyId, id, version);
      if (!mealContext.isCurrent(app, context)) return;
      wx.showToast({ title: '已成功转为常备正式菜', icon: 'success' });
      this.loadDishes();
    } catch (err) { if (mealContext.isCurrent(app, context)) wx.showToast({ title: err.message || '操作失败', icon: 'none' }); }
  }
}));
