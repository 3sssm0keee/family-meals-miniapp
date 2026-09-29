const app = getApp();
const Services = require('../../api/services.js');
const util = require('../../utils/util.js');

Page(require('../../api/page.js')({
  data: {
    members: [], pendingGuests: [], guestCode: '', memberCode: '',
    loading: false, error: '', busyMemberId: '', inviteBusy: ''
  },
  onShow() { return this.loadMembers(); },
  onHide() { this.memberLoadSeq = (this.memberLoadSeq || 0) + 1; },
  onUnload() { this.memberLoadSeq = (this.memberLoadSeq || 0) + 1; },

  async loadMembers() {
    const access = this.captureAdminAccess();
    if (!access) return;
    const family = app.globalData.activeFamily;
    if (!family || family.role !== 'ADMIN') return;
    const familyId = family.id;
    const seq = this.memberLoadSeq = (this.memberLoadSeq || 0) + 1;
    this.setData({ loading: true, error: '', members: [], pendingGuests: [] });
    try {
      const byId = new Map();
      let expectedTotal = null;
      for (let page = 1; ; page++) {
        const result = await Services.listMembers(familyId, page);
        if (seq !== this.memberLoadSeq || !this.isAdminAccessCurrent(access)) return;
        if (!Number.isInteger(result.total) || result.total < 0 ||
            (expectedTotal !== null && result.total !== expectedTotal)) {
          throw new Error('成员列表在加载时发生变化，请重试');
        }
        expectedTotal = result.total;
        const batch = result.items || [];
        for (const member of batch) if (member && member.id) byId.set(member.id, member);
        if (byId.size >= expectedTotal) break;
        if (!batch.length || page > Math.ceil(expectedTotal / 100) + 1) {
          throw new Error('成员列表在加载时发生变化，请重试');
        }
      }
      const now = Date.now();
      const active = [...byId.values()].filter(member => member.status === 'ACTIVE').map(member => ({
        ...member,
        joinedAtText: util.formatBeijingDateTime(member.joinedAt),
        expiresAtText: util.formatBeijingDateTime(member.accessExpiresAt),
        isExpiredGuest: member.role === 'GUEST' && !!member.accessExpiresAt &&
          Date.parse(member.accessExpiresAt) <= now
      }));
      this.setData({
        members: active.filter(member => !member.isExpiredGuest),
        pendingGuests: active.filter(member => member.isExpiredGuest)
      });
    } catch (error) {
      if (seq !== this.memberLoadSeq || !this.isAdminAccessCurrent(access) || this.handleAdminError(error)) return;
      this.setData({ error: error.message || '成员加载失败，请重试' });
    } finally {
      if (seq === this.memberLoadSeq && this.isAdminAccessCurrent(access)) this.setData({ loading: false });
    }
  },

  async onMakePermanent(event) {
    const member = [...this.data.members, ...this.data.pendingGuests].find(item => item.id === event.currentTarget.dataset.id);
    if (!member || member.role !== 'GUEST' || this.data.busyMemberId || this.data.adminAccessState !== 'ready') return;
    const access = this.captureAdminAccess();
    if (!access) return;
    const family = app.globalData.activeFamily;
    this.setData({ busyMemberId: member.id });
    try {
      await Services.updateMemberRole(family.id, member.id, 'MEMBER');
      if (this.isAdminAccessCurrent(access)) {
        await this.loadMembers();
        wx.showToast({ title: '已转为正式成员', icon: 'success' });
      }
    } catch (error) {
      if (this.isAdminAccessCurrent(access) && !this.handleAdminError(error)) wx.showToast({ title: error.message || '转正失败', icon: 'none' });
    } finally { if (this.isAdminAccessCurrent(access)) this.setData({ busyMemberId: '' }); }
  },

  onRemoveMember(event) {
    const member = [...this.data.members, ...this.data.pendingGuests].find(item => item.id === event.currentTarget.dataset.id);
    if (!member || member.role !== 'GUEST' || this.data.busyMemberId || this.data.adminAccessState !== 'ready') return;
    wx.showModal({
      title: '移除访客？',
      content: `移除${member.displayName}的家庭访问权限，历史点单与审计记录会保留。`,
      confirmText: '确认移除',
      success: async result => {
        if (!result.confirm || this.data.adminAccessState !== 'ready') return;
        const family = app.globalData.activeFamily;
        if (!family || family.role !== 'ADMIN') return;
        const access = this.captureAdminAccess();
        if (!access) return;
        this.setData({ busyMemberId: member.id });
        try {
          await Services.removeMember(family.id, member.id);
          if (this.isAdminAccessCurrent(access)) {
            await this.loadMembers();
            wx.showToast({ title: '访客已移除', icon: 'success' });
          }
        } catch (error) {
          if (this.isAdminAccessCurrent(access) && !this.handleAdminError(error)) wx.showToast({ title: error.message || '移除失败', icon: 'none' });
        } finally { if (this.isAdminAccessCurrent(access)) this.setData({ busyMemberId: '' }); }
      }
    });
  },

  async onCreateInvite(event) {
    const role = event.currentTarget.dataset.role;
    if (!['MEMBER', 'GUEST'].includes(role) || this.data.inviteBusy || this.data.adminAccessState !== 'ready') return;
    const family = app.globalData.activeFamily;
    if (!family || family.role !== 'ADMIN') return;
    const access = this.captureAdminAccess();
    if (!access) return;
    this.setData({ inviteBusy: role });
    try {
      const invite = await Services.createInvite(family.id, role);
      if (!this.isAdminAccessCurrent(access)) return;
      this.setData(role === 'MEMBER' ? { memberCode: invite.code } : { guestCode: invite.code });
      wx.showToast({ title: '邀请已生成', icon: 'success' });
    } catch (error) {
      if (this.isAdminAccessCurrent(access) && !this.handleAdminError(error)) wx.showToast({ title: error.message || '生成失败', icon: 'none' });
    } finally { if (this.isAdminAccessCurrent(access)) this.setData({ inviteBusy: '' }); }
  },

  onCopyInvite(event) {
    const code = event.currentTarget.dataset.role === 'MEMBER' ? this.data.memberCode : this.data.guestCode;
    if (code) wx.setClipboardData({ data: code });
  },
  onShareAppMessage(event) {
    const role = event && event.target && event.target.dataset.role;
    const code = role === 'MEMBER' ? this.data.memberCode : this.data.guestCode;
    return { title: '邀请你来 Tobacco‘s kitchen 做客',
      path: '/pages/login/index' + (code ? '?invite=' + encodeURIComponent(code) : '') };
  }
}));
