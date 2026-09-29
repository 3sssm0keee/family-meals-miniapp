const app = getApp();
const Services = require('../../api/services.js');
const util = require('../../utils/util.js');
const { getCurrentMember, setCurrentMember, setActiveFamily } = require('../../api/request.js');

Page(require('../../api/page.js')({
  data: {
    activeFamily: {},
    currentMemberId: 'm1',
    currentMemberName: '张三',
    currentRole: 'ADMIN',
    currentDate: '',
    currentMealType: 'LUNCH',
    totalMembers: 5,
    submittedCount: 4,
    unsubmittedCount: 1,
    unsubmittedNames: '小明',
    pendingReviewCount: 3,
    totalDishesCount: 28,
    sessionStatusText: '选餐中 · 待审核',
    previewDishes: [],
    loading: false
  },

  onShow() {
    return this.initData();
  },

  onPullDownRefresh() {
    this.initData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async initData() {
    const access = this.captureAdminAccess();
    if (!access) return;
    const seq = this.consoleLoadSeq = (this.consoleLoadSeq || 0) + 1;
    const cur = getCurrentMember ? getCurrentMember() : { memberId: 'm1', memberName: '张三', role: 'ADMIN' };
    const dateStr = util.formatDate(new Date());
    const family = app.globalData.activeFamily || { id: 'fam_1', name: '幸福三叶草之家', role: 'ADMIN' };
    const mealType = app.globalData.selectedMealType || this.data.currentMealType;
    const active = () => seq === this.consoleLoadSeq && this.isAdminAccessCurrent(access) &&
      app.globalData.selectedMealType === mealType;

    this.setData({
      activeFamily: family,
      currentMemberId: cur.memberId || '',
      currentMemberName: cur.memberName || (app.globalData.currentUser || {}).displayName || '',
      currentRole: cur.role || family.role,
      currentDate: dateStr,
      currentMealType: mealType,
      hasNoteUpdates: false,
      loading: true,
      previewDishes: [],
      totalDishesCount: null,
      pendingReviewCount: null,
      sessionStatusText: '加载中'
    });

    try {
      // 获取当前就餐会话
      const session = await Services.ensureSession(
        family.id,
        dateStr,
        mealType
      );
      if (!active()) return;

      // 获取菜谱列表
      const resDishes = await Services.listAdminDishes(family.id, false, session.id);
      if (!active()) return;
      if (!Number.isInteger(resDishes.selectableCount)) throw new Error('菜谱库数量尚不可用，请重试');
      const allDishes = resDishes.items || [];

      const reviewRes = await Services.getReview(family.id, session.id);
      if (!active()) return;
      const pendingCount = (reviewRes.dishes || []).reduce((n, d) => n + (d.variants || []).filter(v => v.needsReview).length, 0);

      this.setData({
        previewDishes: allDishes.slice(0, 5),
        totalDishesCount: resDishes.selectableCount,
        pendingReviewCount: pendingCount,
        hasNoteUpdates: reviewRes.hasNoteUpdates === true,
        sessionStatusText: session.canSubmit ? '可提交点餐' : '当前不可提交'
      });
    } catch (e) {
      if (!active() || this.handleAdminError(e)) return;
      this.setData({previewDishes: [], totalDishesCount: null, pendingReviewCount: null, sessionStatusText: '加载失败'});
      wx.showToast({title: e.message || '加载失败，请点击重试加载', icon: 'none'});
    } finally {
      if (active()) this.setData({ loading: false });
    }
  },

  // 前往今日餐次审核页
  onGoReview() {
    wx.navigateTo({
      url: '/pages/admin-review/index'
    });
  },

  // 前往菜谱库列表
  onGoDishes() {
    wx.switchTab({
      url: '/pages/admin-dishes/index'
    });
  },

  // 录入新菜品
  onGoNewDish() {
    wx.navigateTo({
      url: '/pages/admin-dish-edit/index'
    });
  },

  // 编辑菜品 (Point 4 更改菜谱与命名)
  onEditDish(e) {
    const dishId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/admin-dish-edit/index?id=${dishId}`
    });
  },

  // 前往家庭成员与权限管理
  onGoMembers() {
    wx.navigateTo({
      url: '/pages/admin-members/index'
    });
  },

  onGoHistoryCleanup() {
    wx.navigateTo({ url: '/pages/admin-cleanup/index?type=history' });
  },

  onGoFileCleanup() {
    wx.navigateTo({ url: '/pages/admin-cleanup/index?type=files' });
  },

  // 前往决议审计历史
  onGoAudit() {
    wx.navigateTo({
      url: '/pages/admin-audit/index'
    });
  },

  // 返回家庭选菜主页
  onReturnHome() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  // 切换为普通成员小明体验
  onSwitchToUserView() {
    app.globalData.currentUser = { id: 'user_m5', displayName: '小明' };
    app.globalData.activeFamily.role = 'MEMBER';
    setActiveFamily(app.globalData.activeFamily.id, 'MEMBER');
    setCurrentMember('m5', '小明', 'MEMBER');
    wx.showToast({ title: '已切换为成员小明视角', icon: 'none' });
    setTimeout(() => {
      wx.switchTab({
        url: '/pages/index/index'
      });
    }, 400);
  },

  // 切换回掌勺人张三
  onSwitchRole() {
    wx.showActionSheet({
      itemList: ['张三 (掌勺人)', '小明 (未选菜成员)', '李四 (已选菜成员)'],
      success: (res) => {
        if (res.tapIndex === 0) {
          app.globalData.currentUser = { id: 'user_m1', displayName: '张三' };
          app.globalData.activeFamily.role = 'ADMIN';
          setActiveFamily(app.globalData.activeFamily.id, 'ADMIN');
          setCurrentMember('m1', '张三', 'ADMIN');
          this.initData();
        } else if (res.tapIndex === 1) {
          this.onSwitchToUserView();
        } else {
          app.globalData.currentUser = { id: 'user_m2', displayName: '李四' };
          app.globalData.activeFamily.role = 'MEMBER';
          setActiveFamily(app.globalData.activeFamily.id, 'MEMBER');
          setCurrentMember('m2', '李四', 'MEMBER');
          this.onReturnHome();
        }
      }
    });
  }
}));
