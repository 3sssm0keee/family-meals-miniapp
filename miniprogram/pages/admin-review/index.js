const app = getApp();
const Services = require('../../api/services.js');
const CONFIG = require('../../config.js');
const util = require('../../utils/util.js');
const hasReviewAdditions = require('../../api/review-additions.js');

Page(require('../../api/page.js')({
  data: {
    review: { session: {}, dishes: [] },
    draftDecisions: {}, // itemId -> { decision, plannedQuantity, reason }
    hasDirtyDraft: false,
    versionConflictMsg: '',
    hasTemporaryAdditions: false,
    submitting: false
  },

  pollTimer: null,

  onShow() {
    const pending = this.loadReviewData();
    this.startPolling();
    return pending;
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  onPullDownRefresh() {
    this.loadReviewData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      // 依规：无编辑草稿时才静默刷新；有编辑时仅做对比提示
      if (!this.data.hasDirtyDraft) {
        this.loadReviewData(true);
      }
    }, CONFIG.REVIEW_POLL_INTERVAL_MS);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  async loadReviewData(silent = false) {
    const access = this.captureAdminAccess();
    if (!access) return;
    const seq = this.reviewLoadSeq = (this.reviewLoadSeq || 0) + 1;
    const active = () => seq === this.reviewLoadSeq && this.isAdminAccessCurrent(access);
    try {
      const familyId = access.familyId;
      if (!app.globalData.currentSession) await app.initSession();
      if (!active()) return;
      if (!app.globalData.currentSession) throw new Error('餐次未载入，请回首页重试');
      const sessionId = app.globalData.currentSession.id;
      const rev = await Services.getReview(familyId, sessionId);
      if (!active() || !app.globalData.currentSession || app.globalData.currentSession.id !== sessionId) return;
      this.setData({hasTemporaryAdditions: hasReviewAdditions(familyId, rev)});

      if (this.data.hasDirtyDraft && silent) {
        // 如果有草稿，静默轮询时检查版本变化
        if (rev.session.reviewVersion !== this.data.review.session.reviewVersion) {
          this.setData({
            versionConflictMsg: '点餐需求已更新，当前草稿已保留，请核对后提交。'
          });
        }
        return;
      }

      this.setData({
        review: rev,
        versionConflictMsg: ''
      });
    } catch (e) {
      if (active() && !this.handleAdminError(e) && !silent) {
        wx.showToast({ title: e.message || '审核数据加载失败', icon: 'none' });
      }
    }
  },

  // 监听份数输入草稿变动
  onDraftQuantityChange(e) {
    const { itemId, quantity } = e.detail;
    const drafts = { ...this.data.draftDecisions };
    drafts[itemId] = {
      itemId,
      decision: 'CONFIRMED',
      plannedQuantity: quantity ? parseFloat(quantity) : null,
      reason: ''
    };
    this.setData({
      draftDecisions: drafts,
      hasDirtyDraft: true
    });
  },

  // 单项即时决议 (确认或取消)
  async onSingleDecision(e) {
    const { itemId, decision, plannedQuantity, reason } = e.detail;
    const drafts = { ...this.data.draftDecisions };
    drafts[itemId] = {
      itemId,
      decision,
      plannedQuantity,
      reason: reason || ''
    };
    this.setData({
      draftDecisions: drafts,
      hasDirtyDraft: true
    });

    wx.showToast({ title: '已记录，点击底部按钮批量生效', icon: 'none' });
  },

  // 批量提交审核决议 (原子单请求)
  async onSubmitAllReview() {
    const items = [];
    const dishes = this.data.review.dishes || [];

    for (let d of dishes) {
      for (let v of d.variants) {
        const draft = this.data.draftDecisions[v.itemId];
        if (draft) {
          // 有草稿
          if (draft.decision === 'CONFIRMED' && (draft.plannedQuantity === null || isNaN(draft.plannedQuantity))) {
            wx.showToast({ title: `请填写【${d.name}-${v.name}】的制作份数`, icon: 'none' });
            return;
          }
          items.push(draft);
        } else if (v.plannedQuantity !== null && v.decision === 'CONFIRMED') {
          // 沿用已确认数据
          items.push({
            itemId: v.itemId,
            decision: 'CONFIRMED',
            plannedQuantity: v.plannedQuantity,
            reason: v.reason || ''
          });
        }
      }
    }

    if (items.length === 0) {
      wx.showToast({ title: '尚未填写任何审核决议', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      const familyId = app.globalData.activeFamily.id;
      const sessionId = this.data.review.session.id;
      const expectedReviewVersion = this.data.review.session.reviewVersion;

      const result = await Services.reviewMenu(familyId, sessionId, expectedReviewVersion, items);
      this.setData({
        review: result.review,
        hasTemporaryAdditions: hasReviewAdditions(familyId, result.review),
        draftDecisions: {},
        hasDirtyDraft: false,
        versionConflictMsg: ''
      });
      wx.showToast({ title: '审核公布成功！', icon: 'success' });
    } catch (err) {
      console.error('[onSubmitAllReview error]', err);
      if (err.code === 'REVIEW_VERSION_CONFLICT') {
        // 409 冲突：保留输入草稿，提示最新数据
        await this.loadReviewData(false);
        this.setData({
          versionConflictMsg: '点餐需求已更新，草稿已保留，请核对后重试。'
        });
      } else {
        wx.showToast({ title: err.message || '审核提交失败', icon: 'none' });
      }
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 弹窗创建当餐临时特别菜
  onOpenAddTempDish() {
    wx.showModal({
      title: '新增当餐特别菜',
      placeholderText: '请输入菜品名称（如：蒜蓉大闸蟹）',
      editable: true,
      success: async (res) => {
        if (res.confirm) {
          const name = (res.content || '').trim();
          if (!name) return;

          try {
            const familyId = app.globalData.activeFamily.id;
            const sessionId = this.data.review.session.id;
            await Services.createTemporaryDish(familyId, sessionId, {
              name,
              description: '掌勺人当餐采买特供',
              imageFileId: null,
              isAvailable: true,
              variants: [
                {
                  name: '标准份',
                  portionDescription: '当餐专享',
                  description: '',
                  isAvailable: true
                }
              ]
            });
            wx.showToast({ title: '临时菜已建立，可开始审核制作量', icon: 'success' });
            this.loadReviewData();
          } catch (e) {
            wx.showToast({ title: e.message || '创建失败', icon: 'none' });
          }
        }
      }
    });
  }
}));
