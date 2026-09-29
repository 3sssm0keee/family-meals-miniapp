const Services = require('./services.js');
const scope = require('./session-context.js');

// Both entry points edit the same member/session/variant record, never the catalog.
exports.choiceHandlers = app => ({
  async onOpenVariantModal(e) {
    const context = this.loadedContext, dish = e.currentTarget.dataset.dish;
    if (this.data.loading || this.data.choiceSaving || !dish || !scope.isCurrent(app, context)) return;
    const request = this.choiceRequest = (this.choiceRequest || 0) + 1;
    this.choiceContext = context;
    this.choiceDrafts = {};
    this.choiceCart = null; this.choicePersonal = null;
    this.setData({showVariantModal:true,currentDish:dish,selectedVariantId:null,dishNote:'',choiceLoading:true,choiceError:'',choiceSubmitted:false});
    try {
      const [cart, personal] = await Promise.all([Services.getCart(context.familyId,context.sessionId),Services.getPersonalMenu(context.familyId,context.sessionId)]);
      if (request !== this.choiceRequest || !this.data.showVariantModal || !scope.isCurrent(app,this.loadedContext) || !scope.isCurrent(app,context)) return;
      this.choiceCart = cart; this.choicePersonal = personal;
      (cart.items || []).forEach(i => {this.choiceDrafts[i.variantId] = i.note || '';});
      ((personal && personal.items) || []).forEach(i => {this.choiceDrafts[i.variantId] = i.note || '';});
      const first = (dish.variants || []).find(v=>v.isAvailable && !v.deletedAt) || (dish.variants || [])[0];
      if (first) this.onSelectVariant({currentTarget:{dataset:{id:first.id}}});
    } catch(e) {
      if (request === this.choiceRequest && scope.isCurrent(app,context)) this.setData({choiceError:e.message || '备注加载失败，请关闭后重试'});
    } finally { if (request === this.choiceRequest) this.setData({choiceLoading:false}); }
  },
  onCloseVariantModal() {
    if (this.data.choiceSaving) return;
    this.choiceRequest = (this.choiceRequest || 0) + 1;
    this.choiceContext = null;
    this.setData({showVariantModal:false,currentDish:null});
  },
  onSelectVariant(e) {
    if (this.data.choiceSaving || !this.choiceCart) return;
    const id = e.currentTarget.dataset.id;
    const submitted = !!(this.choicePersonal && this.choicePersonal.items.some(i=>i.variantId===id));
    this.setData({selectedVariantId:id,dishNote:this.choiceDrafts[id] || '',choiceSubmitted:submitted});
  },
  onInputDishNote(e) {
    if (this.data.choiceSaving || !this.data.selectedVariantId) return;
    this.choiceDrafts[this.data.selectedVariantId] = e.detail.value;
    this.setData({dishNote:e.detail.value});
  },
  onClearNote() { this.onInputDishNote({detail:{value:''}}); },
  async onConfirmAddChoice() {
    const context=this.choiceContext, id=this.data.selectedVariantId;
    if(this.data.choiceLoading || this.data.choiceSaving || this.data.choiceError || !id || !scope.isCurrent(app,context) || !scope.isCurrent(app,this.loadedContext)) return;
    const personal=this.choicePersonal, submitted=this.data.choiceSubmitted, note=this.data.dishNote;
    this.setData({choiceSaving:true});
    try {
      if(submitted) {
        const result=await Services.updatePersonalItemNote(context.familyId,context.sessionId,id,note,personal.version);
        if(!scope.isCurrent(app,context)) return;
        this.choicePersonal=result;
        this.setData({personalMenu:result});
      } else {
        const result=await Services.updateCartItemNote(context.familyId,context.sessionId,id,note,this.choiceCart.version);
        if(!scope.isCurrent(app,context)) return;
        this.choiceCart=result;
        this.setData({selectedVariantIds:result.items.map(i=>i.variantId)});
      }
      this.setData({showVariantModal:false,currentDish:null});
      wx.showToast({title:submitted?'本次这道菜的备注已保存':'菜品及备注已加入选择',icon:'none'});
    } catch(e) {
      if(scope.isCurrent(app,context)) {
        const conflict=e.code==='VERSION_CONFLICT' || e.code==='ALREADY_SUBMITTED';
        if(conflict)this.setData({choiceError:'点单已变化，请保留备注后关闭重开核对'});
        wx.showToast({title:conflict?'点单已变化，请关闭重开核对':(e.message||'保存失败，备注已保留'),icon:'none'});
      }
    } finally {this.setData({choiceSaving:false});}
  }
});
