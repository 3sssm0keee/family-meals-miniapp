const app = getApp();
const Services = require('../../api/services.js');
const mealContext = require('../../api/session-context.js');
const util = require('../../utils/util.js');

Page(require('../../api/page.js')({
  data: {
    personalMenu: null,
    loading: false,
    loadError: '',
    hasCancelledItems: false,
    submittedTime: ''
  },

  onAuthRecovered() { return this.loadPersonalMenu(); },

  onShow() {
    this.loadPersonalMenu();
  },

  onPullDownRefresh() {
    this.loadPersonalMenu().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadPersonalMenu() {
    const request = this.loadRequest = (this.loadRequest || 0) + 1;
    const identity = mealContext.capture(app);
    let context = null;
    const active = () => request === this.loadRequest && mealContext.sameIdentity(app, identity) && (!context || mealContext.isCurrent(app, context));
    this.loadedContext = null;
    this.setData({ loading: true, loadError: '', personalMenu: null, hasCancelledItems: false, submittedTime: '' });
    try {
      if (!app.globalData.currentSession) await app.initSession();
      if (!active()) return;
      if (!app.globalData.currentSession) throw new Error('餐次未载入，请回首页重试');
      context = mealContext.capture(app);
      const pm = await Services.getPersonalMenu(context.familyId, context.sessionId);
      if (!active()) return;
      this.loadedContext = context;
      if (pm) {
        const hasCancelled = (pm.items || []).some(i => i.decision === 'CANCELLED');
        this.setData({
          personalMenu: pm,
          hasCancelledItems: hasCancelled,
          submittedTime: util.formatTime(pm.submittedAt)
        });
      }
    } catch (e) {
      if (active()) this.setData({ personalMenu: null, hasCancelledItems: false, loadError: e.message || '点单加载失败，请重试' });
    } finally {
      if (request === this.loadRequest) this.setData({ loading: false });
    }
  },

  onRetry() { return this.loadPersonalMenu(); },

  onUnload() {
    this.loadRequest = (this.loadRequest || 0) + 1;
    this.loadedContext = null;
  },

  // 前往主页重新选菜
  onGoReorder() {
    app.globalData.forceReorder = true;
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  // 修改本次单项备注（带 expectedVersion 校验）
  onOpenEditNote(e) {
    const context = this.loadedContext;
    if (this.data.loading || !this.data.personalMenu || !mealContext.isCurrent(app, context)) return;
    const version = this.data.personalMenu.version;
    const request = this.loadRequest;
    const active = () => request === this.loadRequest && mealContext.isCurrent(app, context);
    if (this.data.savingNote) return;
    const variantId = e.currentTarget.dataset.id;
    const item = this.data.personalMenu.items.find(i => i.variantId === variantId);
    if (!item) return;
    const currentNote = item.note || '';
    this.setData({savingNote:true});

    wx.showModal({
      title: '本次这道菜的备注',
      placeholderText: '请输入新的备注说明',
      editable: true,
      content: currentNote,
      success: async (res) => {
        if (res.confirm) {
          if (!active()) { this.setData({savingNote:false}); return; }
          const newNote = (res.content || '').trim();
          try {
            const updatedPm = await Services.updatePersonalItemNote(
              context.familyId,
              context.sessionId,
              variantId,
              newNote,
              version
            );
            if (!active()) { this.setData({savingNote:false}); return; }
            this.setData({ personalMenu: updatedPm });
            wx.showToast({ title: '备注已更新', icon: 'success' });
          } catch (err) {
            if (!active()) { this.setData({savingNote:false}); return; }
            wx.showToast({ title: err.message || '更新失败', icon: 'none' });
            if (err.code === 'VERSION_CONFLICT') await this.loadPersonalMenu();
          } finally { this.setData({savingNote:false}); }
        } else { this.setData({savingNote:false}); }
      },
      fail: () => this.setData({savingNote:false})
    });
  }
}));
