const app = getApp();
const Services = require('../../api/services.js');
const util = require('../../utils/util.js');
const mealContext = require('../../api/session-context.js');
const { getCurrentMember, setCurrentMember, setActiveFamily } = require('../../api/request.js');

Page(require('../../api/page.js')({
  ...require('../../api/item-notes.js').choiceHandlers(app),
  data: {
    activeFamily: {},
    currentMemberId: '',
    currentMemberName: '',
    currentRole: '',
    currentDate: '',
    currentMealType: 'LUNCH',
    currentSession: null,
    dishes: [],
    displayDishes: [],
    isAdmin: false,
    membersList: [],
    selectedVariantIds: [],
    hasSubmitted: false,
    loading: false,
    nicknameDraft: '',
    nicknameSaved: '',
    nicknameDirty: false,
    nicknameSaving: false,
    nicknameError: '',
    nicknameFocus: false,
    nicknameEditing: false,
    nicknameInputType: 'text',

    // 规格选择弹层 (对标图 2 & 3)
    showVariantModal: false,
    currentDish: null,
    selectedVariantId: null,
    dishNote: ''
  },

  syncNickname() {
    const user = app.globalData.currentUser || {};
    if (this.nicknameUserId !== user.id) {
      this.nicknameUserId = user.id;
      this.nicknameSaveSeq = (this.nicknameSaveSeq || 0) + 1;
      this.setData({ nicknameDraft: user.displayName || '', nicknameSaved: user.displayName || '',
        nicknameDirty: false, nicknameSaving: false, nicknameError: '', nicknameFocus: false,
        nicknameEditing: !user.displayName });
    } else if (!this.data.nicknameDirty && user.displayName !== this.data.nicknameSaved) {
      this.setData({ nicknameDraft: user.displayName || '', nicknameSaved: user.displayName || '' });
    }
  },
  onNicknameInput(event) {
    this.setData({ nicknameDraft: event.detail.value, nicknameDirty: true, nicknameError: '' });
  },
  onEditNickname() {
    this.setData({ nicknameEditing: true, nicknameError: '' });
  },
  onCancelNicknameEdit() {
    if (this.data.nicknameSaving || !this.data.nicknameSaved) return;
    this.setData({ nicknameEditing: false, nicknameDraft: this.data.nicknameSaved,
      nicknameDirty: false, nicknameError: '', nicknameFocus: false });
  },
  onChooseNickname() {
    if (!this.data.nicknameEditing || this.data.nicknameSaving) return;
    this.setData({ nicknameFocus: false });
    wx.showActionSheet({
      itemList: ['使用微信昵称', '自定义昵称'],
      success: ({ tapIndex }) => {
        this.setData({ nicknameInputType: tapIndex === 0 ? 'nickname' : 'text', nicknameFocus: false },
          () => this.setData({ nicknameFocus: true }));
      }
    });
  },
  onNicknameBlur() { this.setData({ nicknameFocus: false }); },
  async onSaveNickname() {
    if (!this.data.nicknameEditing || this.data.nicknameSaving) return;
    const name = this.data.nicknameDraft.trim();
    if (!name || name.length > 40) {
      this.setData({ nicknameError: '昵称需要 1 至 40 个字符' });
      return;
    }
    const userId = app.globalData.currentUser && app.globalData.currentUser.id;
    if (!userId) return;
    const saveSeq = this.nicknameSaveSeq = (this.nicknameSaveSeq || 0) + 1;
    this.setData({ nicknameSaving: true, nicknameError: '' });
    try {
      const user = await Services.updateMe(name);
      if (saveSeq !== this.nicknameSaveSeq || !app.globalData.currentUser || app.globalData.currentUser.id !== userId) return;
      app.globalData.currentUser = user;
      this.setData({ nicknameSaved: user.displayName, nicknameDraft: user.displayName,
        nicknameDirty: false, nicknameEditing: false, nicknameFocus: false,
        currentMemberName: user.displayName,
        membersList: this.data.membersList.map(member => member.id === this.data.currentMemberId
          ? { ...member, displayName: user.displayName } : member) });
      wx.showToast({ title: '昵称已保存', icon: 'success' });
    } catch (error) {
      if (saveSeq === this.nicknameSaveSeq && app.globalData.currentUser && app.globalData.currentUser.id === userId) {
        this.setData({ nicknameError: error.message || '保存失败，请重试' });
      }
    } finally { if (saveSeq === this.nicknameSaveSeq) this.setData({ nicknameSaving: false }); }
  },

  onAuthRecovered() { return this.initData(); },

  onShow() {
    this.syncNickname();
    this.setData({ currentMealType: app.globalData.selectedMealType || 'LUNCH' });
    this.initData();
  },

  onUnload() { this.loadRequest = (this.loadRequest || 0) + 1; },

  onPullDownRefresh() {
    this.initData().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  async initData() {
    this.syncNickname();
    const requestId = this.loadRequest = (this.loadRequest || 0) + 1;
    const cur = getCurrentMember ? getCurrentMember() : {};
    const family = app.globalData.activeFamily;
    const role = cur.role || (family && family.role);
    const serviceDate = util.formatDate(new Date());
    const mealType = this.data.currentMealType;
    this.loadedContext = null;
    this.setData({ activeFamily: family, currentMemberId: cur.memberId || '',
      currentMemberName: cur.memberName || (app.globalData.currentUser || {}).displayName || '',
      currentRole: role, isAdmin: role === 'ADMIN', currentDate: serviceDate,
      loading: true, currentSession: null, dishes: [], displayDishes: [], selectedVariantIds: [],
      personalMenu: null, hasSubmitted: false, hasCancelledItems: false, allCancelled: false,
      cancelledReasons: '', showVariantModal: false, currentDish: null, selectedVariantId: null });
    const pending = mealContext.select(app, serviceDate, mealType);
    const selection = mealContext.capture(app);
    const active = () => this.loadRequest === requestId && mealContext.sameScope(app, selection);
    try {
      const session = await pending;
      if (!session || !active()) return;
      const context = mealContext.capture(app);
      const [resDishes, pm, cart] = await Promise.all([
        Services.listDishes(context.familyId, session.id),
        Services.getPersonalMenu(context.familyId, session.id),
        Services.getCart(context.familyId, session.id)
      ]);
      if (!active() || !mealContext.isCurrent(app, context)) return;
      const roster = this.data.useMock ? this.data.membersList : [];
      if (!this.data.useMock) {
        let page = 1, response;
        do {
          response = await Services.listFamilyMembers(context.familyId, page++);
          if (!active() || !mealContext.isCurrent(app, context)) return;
          roster.push(...response.items);
        } while (roster.length < response.total && response.items.length);
      }
      const cancelled = pm ? pm.items.filter(i => i.decision === 'CANCELLED') : [];
      const isReordering = !!(pm && session.canAppend && app.globalData.forceReorder);
      app.globalData.forceReorder = false;
      this.loadedContext = context;
      this.setData({ currentSession: session, dishes: resDishes.items || [],
        displayDishes: (resDishes.items || []).slice(0, 6), personalMenu: pm,
        hasSubmitted: !!pm && !isReordering, isReordering,
        hasCancelledItems: cancelled.length > 0, allCancelled: !!pm && cancelled.length === pm.items.length,
        cancelledReasons: cancelled.map(i => `【${i.dishName}-${i.variantName}】${i.reason ? '（原因：' + i.reason + '）' : ''}`).join('；'),
        selectedVariantIds: (cart.items || []).map(i => i.variantId),
        membersList: roster.map(m => Object.assign({}, m, {
          avatarUrl: m.avatar ? m.avatar.url : (m.avatarUrl || ''),
          hasSubmitted: m.id === this.data.currentMemberId ? !!pm : m.hasSubmitted
        })) });
    } catch (e) {
      if (active()) wx.showToast({ title: e.message || '加载失败，请下拉重试', icon: 'none' });
    } finally {
      if (this.loadRequest === requestId) this.setData({ loading: false });
    }
  },

  canWriteCurrentMeal() {
    if (!this.data.loading && mealContext.isCurrent(app, this.loadedContext)) return true;
    wx.showToast({ title: '餐次正在切换或尚未载入，请稍后重试', icon: 'none' });
    return false;
  },

  // 换一批菜品推荐
  onShuffleDishes() {
    const list = [...this.data.dishes];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    this.setData({ displayDishes: list.slice(0, 6) });
    wx.showToast({ title: '已换一批推荐美味 ♡', icon: 'none' });
  },

  // 收藏/点赞爱心
  onToggleFavorite(e) {
    const dishId = e.currentTarget.dataset.id;
    const updated = this.data.displayDishes.map(d => {
      if (d.id === dishId) {
        return Object.assign({}, d, { isFavorite: !d.isFavorite });
      }
      return d;
    });
    this.setData({ displayDishes: updated });
  },

  // 前往菜品库选菜
  onGoSelectDishes() {
    wx.switchTab({
      url: '/pages/admin-dishes/index'
    });
  },

  // 打开规格选版本弹层 (对标图 2 & 3)


  onPreventClose() {},




  // 确认加入我的选择 (购物车)

  // 快速切换测试角色 (张三/小明/李四)
  onQuickSwitchMember(e) {
    const { id, name, role } = e.currentTarget.dataset;
    app.globalData.currentUser = { id: `user_${id}`, displayName: name };
    app.globalData.activeFamily.role = role;
    setActiveFamily(app.globalData.activeFamily.id, role);
    setCurrentMember(id, name, role);

    this.setData({
      currentMemberId: id,
      currentMemberName: name,
      currentRole: role,
      isAdmin: role === 'ADMIN'
    });

    wx.showToast({
      title: `当前点单人：${name} (${role === 'ADMIN' ? '掌勺' : '成员'})`,
      icon: 'none'
    });
    this.initData();
  },

  // 同步用户微信真实头像 (Point 5)
  async onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl;
    const userId = app.globalData.currentUser && app.globalData.currentUser.id;
    if (!avatarUrl || !userId || this.data.savingAvatar) return;
    if (this.data.useMock) {
      this.setData({ membersList: this.data.membersList.map(m => m.id === this.data.currentMemberId ? {...m, avatarUrl} : m) });
      wx.showToast({title:'演示头像已更新，未保存',icon:'none'});return;
    }
    this.setData({savingAvatar:true});
    try {
      const user = await Services.uploadAvatar(avatarUrl);
      if (!app.globalData.currentUser || app.globalData.currentUser.id !== userId) return;
      app.globalData.currentUser = user;
      await this.initData();
      wx.showToast({title:'头像已保存',icon:'success'});
    } catch(e) { wx.showToast({title:e.message || '头像保存失败，请重试',icon:'none'}); }
    finally { this.setData({savingAvatar:false}); }
  },

  // 跳转掌勺人专属工作台 (Point 6)
  onGoAdminConsole() {
    wx.navigateTo({
      url: '/pages/admin-console/index'
    });
  },

  // 开启重新选菜模式
  onReorder() {
    if (!this.data.currentSession || !this.data.currentSession.canAppend) { wx.showToast({title: '本餐次当前不可重新提交', icon: 'none'}); return; }
    this.setData({
      hasSubmitted: false,
      isReordering: true,
      selectedVariantIds: []
    });
    wx.showToast({ title: '请追加新菜，原点单会保留', icon: 'none' });
  },

  // 切换中餐/晚餐
  onSwitchMeal(e) {
    const mealType = e.currentTarget.dataset.type;
    if (mealType === this.data.currentMealType) return;
    this.setData({ currentMealType: mealType, isReordering: false }, () => {
      this.initData();
    });
  },

  // 切换某个规格勾选（集合式单选添加/移除，无加减器）
  async onToggleVariant(e) {
    if (!this.canWriteCurrentMeal()) return;
    const context = this.loadedContext;
    if (this.data.hasSubmitted && !this.data.currentSession.canAppend) {
      if (this.data.hasCancelledItems) {
        wx.showModal({
          title: '菜品已被取消',
          content: `${this.data.cancelledReasons}\n\n是否立即开始重新挑选其他菜品？`,
          confirmText: '去选菜',
          success: (res) => {
            if (res.confirm) {
              this.onReorder();
            }
          }
        });
        return;
      }
      wx.showToast({ title: '本餐次暂不支持追加，备注可在“我的”修改', icon: 'none' });
      return;
    }

    const { variantId } = e.detail;
    const isSelected = this.data.selectedVariantIds.includes(variantId);

    try {
      if (isSelected) {
        await Services.removeCartItem(context.familyId, context.sessionId, variantId);
        if (!mealContext.isCurrent(app, context)) return;
        const newIds = this.data.selectedVariantIds.filter(id => id !== variantId);
        this.setData({ selectedVariantIds: newIds });
      } else {
        await Services.addCartItem(context.familyId, context.sessionId, variantId);
        if (!mealContext.isCurrent(app, context)) return;
        const newIds = [...this.data.selectedVariantIds, variantId];
        this.setData({ selectedVariantIds: newIds });
      }
    } catch (err) {
      console.error('[onToggleVariant Error]', err);
    }
  },

  onOpenCart() {
    wx.switchTab({
      url: '/pages/cart/index'
    });
  }
}));
