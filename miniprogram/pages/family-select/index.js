const app = getApp();
const Services = require('../../api/services.js');
Page(require('../../api/page.js')({
  data: {accessExpired:false, codeFocus:false, families:[], displayName:'', code:'', loading:true, submitting:false, error:''},
  onShow() {
    this.setData({accessExpired:!!app.globalData.accessExpired});
    this.setData({displayName:(app.globalData.currentUser || {}).displayName || ''});
    if (app.globalData.pendingInvite) this.setData({code:app.globalData.pendingInvite});
    this.loadFamilies();
  },
  async loadFamilies() {
    this.setData({loading:true,error:''});
    try {
      const list=await Services.listMyFamilies();
      const accessExpired=list.some(f=>f.accessExpiresAt && Date.parse(f.accessExpiresAt)<=Date.now());
      app.globalData.accessExpired=accessExpired;
      this.setData({accessExpired,families:list.filter(f=>!f.accessExpiresAt || Date.parse(f.accessExpiresAt)>Date.now())});
    }
    catch(e) { this.setData({families:[],error:'身份查询失败，请重试'}); }
    finally { this.setData({loading:false}); }
  },
  onEnterNewCode() {this.setData({code:'',codeFocus:true,error:''});},
  onNameInput(e) { this.setData({displayName:e.detail.value}); },
  onCodeInput(e) { this.setData({code:e.detail.value,error:''}); },
  onSelectFamily(e) {
    const item = this.data.families.find(f=>f.id === e.currentTarget.dataset.id);
    if(item) app.enterFamily(item);
  },
  async onRedeemInvite() {
    if(this.data.submitting || this.data.loading) return;
    const code = this.data.code.trim();
    if(!code) {this.setData({error:'请输入邀请码'});return;}
    this.setData({submitting:true,error:''});
    try {
      const name=this.data.displayName.trim();
      if(!name) {this.setData({error:'请输入家人能认出的昵称'});return;}
      app.globalData.currentUser=await Services.updateMe(name);
      const result=await Services.redeemInvite(code);
      app.globalData.pendingInvite = null;
      app.enterFamily(result.family);
    } catch(e) {
      const messages={NOT_FOUND:'邀请码不正确',VALIDATION_ERROR:'邀请码格式不正确',INVITE_EXPIRED:'邀请已过期，请联系家人重新邀请',INVITE_REVOKED:'邀请已撤销，请联系家人',MEMBERSHIP_INACTIVE:'当前身份不可用，请联系掌勺人',DEPENDENCY_UNAVAILABLE:'注册暂未开放，请联系掌勺人'};
      this.setData({error:messages[e.code] || e.message || '加入失败，请重试'});
    } finally {this.setData({submitting:false});}
  }
}));
