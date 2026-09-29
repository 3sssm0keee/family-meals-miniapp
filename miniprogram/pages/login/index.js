const app = getApp();
const Services = require('../../api/services.js');
Page(require('../../api/page.js')({
  data: { loading: false, error: '', showInvite:false, inviteCode:'', displayName:'' },
  onLoad(query) {
    if (query && query.invite) {app.globalData.pendingInvite = query.invite;this.setData({showInvite:true,inviteCode:query.invite});}
  },
  onShow() {
    if (app.globalData.currentUser && !this.data.showInvite) {
      if (app.globalData.pendingInvite || !app.globalData.activeFamily) wx.reLaunch({url:'/pages/family-select/index'});
      else app.enterFamily(app.globalData.activeFamily);
    }
  },
  onShowInvite() { this.setData({showInvite:true,error:''}); },
  onInviteInput(e) { this.setData({inviteCode:e.detail.value,error:''}); },
  onNameInput(e) { this.setData({displayName:e.detail.value}); },
  async onInviteLogin() {
    if(this.data.loading)return;
    const name=this.data.displayName.trim(),code=this.data.inviteCode.trim();
    if(!name || !code){this.setData({error:'请填写昵称和邀请码'});return;}
    this.setData({loading:true,error:''});
    try {
      await app.login(false,true);
      app.globalData.currentUser=await Services.updateMe(name);
      const result=await Services.redeemInvite(code);
      app.globalData.pendingInvite=null;
      app.enterFamily(result.family);
    } catch(e) {
      const messages={NOT_FOUND:'邀请码不正确',VALIDATION_ERROR:'邀请码格式不正确',INVITE_EXPIRED:'邀请码已过期，请联系管理员获取新的邀请码',INVITE_REVOKED:'邀请码已撤销，请联系管理员',MEMBERSHIP_INACTIVE:'当前访问权限已过期或不可用，请联系管理员获取新的邀请码',DEPENDENCY_UNAVAILABLE:'登录服务暂不可用，请稍后重试'};
      this.setData({error:messages[e.code] || e.message || '登录验证失败，请重试'});
    } finally {this.setData({loading:false});}
  },
  async onLogin() {
    if (this.data.loading) return;
    this.setData({loading:true,error:''});
    try { await app.login(); }
    catch (e) { this.setData({error:e.message || '登录失败，请重试'}); }
    finally { this.setData({loading:false}); }
  }
}));
