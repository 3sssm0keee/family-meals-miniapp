const Services = require('./services.js');
const deletionState = require('./dish-deletion-state.js');
const variantBody = v => ({ name: v.name.trim(), portionDescription: v.portionDescription.trim(), description: v.description || '', isAvailable: v.isAvailable !== false });
const blankVariant = () => ({ name: '', portionDescription: '', description: '', isAvailable: true });
module.exports = {
  data: { isEditing: false, dishId: '', name: '', description: '', imageUrl: '', imageFileId: null, expectedVersion: null, isAvailable: true, variants: [blankVariant()], saving: false, uploading: false, conflict: false, deleting: false, deletePreview: null, deleteError: '', deleteBlocked: false },
  onLoad(options) {
    this.editFamilyId = (getApp().globalData.activeFamily || {}).id;
    wx.setNavigationBarTitle({title: options.id ? '编辑菜品' : '新建菜品'});
    if (options.id) { this.setData({ isEditing: true, dishId: options.id }); return this.loadExistingDish(); }
  },
  onHide() {
    this.deleteAccess = null;
    this.setData({ deletePreview: null, deleteError: '', deleteBlocked: false, deleting: false });
  },
  onUnload() { this.onHide(); },
  async loadExistingDish() {
    const access = this.captureAdminAccess();
    if (!access) return;
    try {
      const dish = await Services.getAdminDish(access.familyId, this.data.dishId);
      if (!this.isAdminAccessCurrent(access)) return;
      if (!dish || !Number.isInteger(dish.version)) throw new Error('菜品详情缺少版本，不能编辑');
      this.originalVariants = (dish.variants || []).filter(v => !v.deletedAt).map(v => ({ ...v }));
      this.saveSteps = null;
      this.setData({ name: dish.name, description: dish.description, imageUrl: dish.image ? dish.image.url : '', imageFileId: dish.image ? dish.image.fileId : null, expectedVersion: dish.version, isAvailable: dish.isAvailable, variants: this.originalVariants.map(v => ({ ...v })), conflict: false });
    } catch (e) {
      if (!this.isAdminAccessCurrent(access) || this.handleAdminError(e)) return;
      this.setData({ conflict: true });
      wx.showToast({ title: e.message || '载入失败', icon: 'none' });
    }
  },
  onReloadDish() {
    wx.showModal({ title: '重新载入菜品', content: '将放弃当前草稿，读取服务器内容。', success: r => { if (r.confirm) this.loadExistingDish(); } });
  },
  onNameInput(e) { this.setData({ name: e.detail.value }); },
  onDescInput(e) { this.setData({ description: e.detail.value }); },
  onAddVariant() { if (!this.data.saving && this.data.variants.length < 20) this.setData({ variants: [...this.data.variants, blankVariant()] }); },
  onRemoveVariant(e) { if (!this.data.saving && this.data.variants.length > 1) this.setData({ variants: this.data.variants.filter((_, i) => i !== Number(e.currentTarget.dataset.idx)) }); },
  onVNameInput(e) { this.updateVariantInput(e, 'name'); },
  onVPortionInput(e) { this.updateVariantInput(e, 'portionDescription'); },
  updateVariantInput(e, key) {
    if (this.data.saving) return;
    this.setData({ variants: this.data.variants.map((v, i) => i === Number(e.currentTarget.dataset.idx) ? { ...v, [key]: e.detail.value } : v) });
  },
  onChooseDishImage() {
    if (this.data.uploading || this.data.saving) return;
    wx.chooseMedia({ count: 1, mediaType: ['image'], success: async result => {
      const file = result.tempFiles && result.tempFiles[0];
      if (!file) return;
      // The upload layer applies limits for the selected transport (COS: 20 MiB).
      this.setData({ uploading: true });
      try {
        const uploaded = await Services.uploadFile(getApp().globalData.activeFamily.id, file.tempFilePath);
        if (!uploaded.fileId || !uploaded.url) throw new Error('上传响应缺少文件信息');
        this.setData({ imageFileId: uploaded.fileId, imageUrl: uploaded.url });
      } catch (e) { wx.showToast({ title: e.message || '上传失败，请重试', icon: 'none' }); }
      finally { this.setData({ uploading: false }); }
    } });
  },
  async onDeleteDish() {
    const access = this.captureAdminAccess();
    if (!access || access.familyId !== this.editFamilyId || !this.data.isEditing ||
        !Number.isInteger(this.data.expectedVersion) || this.data.saving || this.data.uploading ||
        this.data.deleting || this.data.conflict || this.saveSteps) return;
    const id = this.data.dishId;
    this.setData({ deleting: true, deleteError: '', deleteBlocked: false, deletePreview: null });
    try {
      const preview = await Services.getDishDeletionPreview(access.familyId, id);
      if (!this.isAdminAccessCurrent(access)) return;
      if (!preview || preview.dishId !== id || !Number.isInteger(preview.expectedVersion))
        throw new Error('删除预览缺少菜品或版本，请重新载入');
      if (preview.expectedVersion !== this.data.expectedVersion) {
        this.setData({ conflict: true });
        throw new Error('菜品已更新，请重新载入后再删除');
      }
      this.deleteAccess = access;
      const blocked = deletionState.has(access.userId, access.familyId, id, preview.expectedVersion);
      this.setData({ deletePreview: preview, deleteBlocked: blocked,
        deleteError: blocked ? '上次删除结果待核对，请先核对结果。' : '' });
    } catch (e) {
      if (this.isAdminAccessCurrent(access) && !this.handleAdminError(e))
        wx.showToast({ title: e.message || '删除预览载入失败', icon: 'none' });
    } finally {
      if (this.isAdminAccessCurrent(access)) this.setData({ deleting: false });
    }
  },
  onCancelDishDelete() {
    if (this.data.deleting) return;
    this.deleteAccess = null;
    this.setData({ deletePreview: null, deleteError: '', deleteBlocked: false });
  },
  async onConfirmDishDelete() {
    const access = this.deleteAccess, preview = this.data.deletePreview;
    if (!preview || this.data.deleting || this.data.deleteBlocked ||
        !this.isAdminAccessCurrent(access) || preview.dishId !== this.data.dishId ||
        preview.expectedVersion !== this.data.expectedVersion) return;
    this.setData({ deleting: true, deleteError: '' });
    try {
      await Services.deleteDish(access.familyId, preview.dishId, preview.expectedVersion);
      if (!this.isAdminAccessCurrent(access)) return;
      this.deleteAccess = null;
      this.setData({ deletePreview: null });
      wx.showToast({ title: '菜品已删除', icon: 'success' });
      wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/admin-dishes/index' }) });
    } catch (e) {
      if (!this.isAdminAccessCurrent(access) || this.handleAdminError(e)) return;
      const uncertain = !e.statusCode || e.statusCode >= 500 || ['NETWORK_ERROR', 'REQUEST_IN_PROGRESS', 'INTERNAL_ERROR'].includes(e.code);
      if (uncertain) deletionState.mark(access.userId, access.familyId, preview.dishId, preview.expectedVersion);
      this.setData({ deleteBlocked: true,
        deleteError: uncertain ? '删除结果待核对，请返回菜品列表刷新后再操作。' :
          (e.code === 'VERSION_CONFLICT' ? '菜品已更新，请重新载入后再删除。' : (e.message || '删除失败，请刷新后再操作。')) });
    } finally {
      if (this.isAdminAccessCurrent(access)) this.setData({ deleting: false });
    }
  },
  async onReconcileDishDelete() {
    const access = this.deleteAccess, preview = this.data.deletePreview;
    if (!preview || !this.data.deleteBlocked || this.data.deleting ||
        !this.isAdminAccessCurrent(access)) return;
    this.setData({ deleting: true });
    try {
      const current = await Services.getDishDeletionPreview(access.familyId, preview.dishId);
      if (!this.isAdminAccessCurrent(access)) return;
      if (!current || !Number.isInteger(current.expectedVersion)) throw new Error('核对结果缺少版本');
      if (current.expectedVersion !== preview.expectedVersion) {
        deletionState.clear(access.userId, access.familyId, preview.dishId, preview.expectedVersion);
        this.setData({ deletePreview: null, conflict: true, deleteError: '' });
        wx.showToast({ title: '菜品版本已变化，请重新载入', icon: 'none' });
      } else {
        deletionState.clear(access.userId, access.familyId, preview.dishId, preview.expectedVersion);
        this.setData({ deletePreview: current, deleteBlocked: false, deleteError: '' });
      }
    } catch (e) {
      if (!this.isAdminAccessCurrent(access) || this.handleAdminError(e)) return;
      if (e.statusCode === 404) {
        deletionState.clear(access.userId, access.familyId, preview.dishId, preview.expectedVersion);
        this.setData({ deletePreview: null, deleteError: '' });
        wx.showToast({ title: '菜品已删除', icon: 'success' });
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/admin-dishes/index' }) });
      } else this.setData({ deleteError: e.message || '核对失败，请稍后重试' });
    } finally {
      if (this.isAdminAccessCurrent(access)) this.setData({ deleting: false });
    }
  },
  async onSaveDish() {
    if (this.data.deleting || this.data.saving || this.data.uploading || this.data.conflict) return;
    const family = getApp().globalData.activeFamily;
    if (!family || family.role !== 'ADMIN') { wx.showToast({ title: '需要掌勺人权限', icon: 'none' }); return; }
    const variants = this.data.variants.map(variantBody);
    const body = { name: this.data.name.trim(), description: this.data.description, imageFileId: this.data.imageFileId, isAvailable: this.data.isAvailable };
    if (!body.name || body.name.length > 60 || body.description.length > 1000 || !variants.length || variants.length > 20 || variants.some(v => !v.name || v.name.length > 40 || !v.portionDescription || v.portionDescription.length > 200)) {
      wx.showToast({ title: '请检查名称、描述和规格分量长度', icon: 'none' }); return;
    }
    this.setData({ saving: true });
    try {
      if (!this.data.isEditing) {
        await Services.createDish(family.id, { ...body, variants });
      } else {
        if (!Number.isInteger(this.data.expectedVersion)) throw new Error('缺少版本，请重新载入');
        // Keep a fixed sequence after an uncertain result. Retrying only resumes the failed step.
        const snapshot = JSON.stringify([body, this.data.variants]);
        if (this.saveSteps && this.saveSnapshot !== snapshot) throw new Error('上次保存结果未明，请先重新载入核对');
        if (!this.saveSteps) {
          this.saveSnapshot = snapshot;
          this.saveSteps = [() => Services.updateDish(family.id, this.data.dishId, { ...body, expectedVersion: this.data.expectedVersion })];
          const originals = this.originalVariants || [];
          this.data.variants.forEach((v, i) => {
            const old = originals.find(o => o.id === v.id);
            if (!v.id) this.saveSteps.push(() => Services.createVariant(family.id, this.data.dishId, variants[i]));
            else if (!old) throw new Error('规格版本丢失，请重新载入');
            else if (JSON.stringify(variantBody(old)) !== JSON.stringify(variants[i])) this.saveSteps.push(() => Services.updateVariant(family.id, this.data.dishId, v.id, { ...variants[i], expectedVersion: old.version }));
          });
          originals.filter(v => !this.data.variants.some(n => n.id === v.id)).forEach(v => this.saveSteps.push(() => Services.deleteVariant(family.id, this.data.dishId, v.id, v.version)));
        }
        while (this.saveSteps.length) { await this.saveSteps[0](); this.saveSteps.shift(); }
      }
      wx.showToast({ title: '保存成功', icon: 'success' });
      wx.navigateBack();
    } catch (e) {
      const retryable = e.statusCode >= 500 || ['NETWORK_ERROR', 'REQUEST_IN_PROGRESS', 'RATE_LIMITED', 'INTERNAL_ERROR', 'AUTH_REQUIRED'].includes(e.code);
      if (this.data.isEditing && !retryable) this.setData({ conflict: true });
      wx.showModal({ title: '保存未完成', content: (e.message || '请求失败') + (this.data.isEditing ? '。部分修改可能已保存；草稿已保留，请核对后继续。' : '。草稿已保留。'), showCancel: false });
    } finally { this.setData({ saving: false }); }
  }
};
