const app = getApp();
const Services = require('../../api/services.js');
const mealContext = require('../../api/session-context.js');
const deletionState = require('../../api/dish-deletion-state.js');
const beijingTime = value => {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return '时间未知';
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23' }).formatToParts(time);
  const get = type => (parts.find(part => part.type === type) || {}).value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
};
const cleanupFailureText = code => ({
  STORAGE_DELETE_FAILED: '存储图片删除失败，可重试。',
  REFERENCE_AFTER_DELETE: '删除对象后检测到新引用，元数据未清理，请核对。',
  FILE_REFERENCED: '图片仍被菜品或头像引用，已跳过。'
}[code] || '清理失败，请刷新状态后核对或重试。');

Page(require('../../api/page.js')({
  data: {
    isAdmin: false,
    viewType: 'history', maintenanceError: '',
    historyOpen: false, historyLoading: false, historyCandidates: [],
    historySelectedCount: 0, historyResults: [], batchPreview: null, batchRunning: false,
    fileCleanupOpen: false, fileCleanupLoading: false, fileCandidates: [],
    fileCleanupError: '', fileCleanupBusy: '', fileCleanupUncertain: '',
    deletePreview: null, deleteError: '', deleteBlocked: false, deleting: false
  },
  onLoad(options) {
    this.setData({ viewType: options && options.type === 'files' ? 'files' : 'history' });
  },
  async onShow() {
    const access = this.captureAdminAccess();
    if (!access) return;
    const seq = this.maintenanceSeq = (this.maintenanceSeq || 0) + 1;
    this.loadedContext = null;
    this.setData({ isAdmin: false, maintenanceError: '', historyOpen: false, historyCandidates: [], historyResults: [],
      historySelectedCount: 0, batchPreview: null, batchRunning: false,
      fileCleanupOpen: false, fileCandidates: [], fileCleanupBusy: '', fileCleanupUncertain: '',
      deletePreview: null, deleteError: '', deleteBlocked: false, deleting: false });
    try {
      if (!app.globalData.currentSession) await app.initSession();
      if (seq !== this.maintenanceSeq || !this.isAdminAccessCurrent(access)) return;
      this.loadedContext = mealContext.capture(app);
      if (!this.loadedContext.sessionId) throw new Error('餐次未载入，请回首页重试');
      this.setData({ isAdmin: true });
      if (this.data.viewType === 'files') await this.onToggleFileCleanup();
      else await this.onToggleHistory();
    } catch (error) {
      if (seq === this.maintenanceSeq && this.isAdminAccessCurrent(access))
        this.setData({ maintenanceError: error.message || '维护页载入失败' });
    }
  },
  onHide() {
    this.maintenanceSeq = (this.maintenanceSeq || 0) + 1;
    this.historySeq = (this.historySeq || 0) + 1;
    this.fileCleanupSeq = (this.fileCleanupSeq || 0) + 1;
    this.deleteSeq = (this.deleteSeq || 0) + 1;
    this.loadedContext = null;
    this.deleteContext = null;
    this.batchContext = null;
    this.setData({ isAdmin: false, historyOpen: false, historyCandidates: [],
      historySelectedCount: 0, historyResults: [], batchPreview: null, batchRunning: false,
      fileCleanupOpen: false, fileCandidates: [], fileCleanupBusy: '', fileCleanupUncertain: '',
      deletePreview: null, deleteError: '', deleteBlocked: false, deleting: false });
  },
  onUnload() { this.onHide(); },
  currentWriteContext() {
    const access = this.captureAdminAccess();
    if (!access || !this.data.isAdmin) return null;
    if (mealContext.isCurrent(app, this.loadedContext)) return this.loadedContext;
    wx.showToast({ title: '家庭或餐次已变更，请重新进入维护页', icon: 'none' });
    return null;
  },
  async onToggleHistory() {
    if (!this.data.isAdmin || this.data.batchRunning) return;
    if (this.data.historyOpen) {
      this.historySeq = (this.historySeq || 0) + 1;
      this.setData({ historyOpen: false, historyCandidates: [], historyLoading: false,
        historySelectedCount: 0, batchPreview: null });
      return;
    }
    this.setData({ historyOpen: true });
    return this.loadHistoryCandidates();
  },
  async loadHistoryCandidates() {
    const context = this.currentWriteContext();
    if (!context || !this.data.historyOpen) return;
    const seq = this.historySeq = (this.historySeq || 0) + 1;
    this.setData({ historyLoading: true, historyCandidates: [], historyError: '' });
    try {
      const result = await Services.listAdminDishes(context.familyId, false, '', true);
      if (seq !== this.historySeq || !this.data.historyOpen || !this.data.isAdmin ||
          !mealContext.isCurrent(app, context)) return;
      const previous = new Map(this.data.historyCandidates.map(item => [item.id, item.selected]));
      const candidates = (result.items || []).map(dish => ({
        id: dish.id, name: dish.name, version: dish.version,
        deletedAtText: beijingTime(dish.deletedAt), selected: !!previous.get(dish.id)
      }));
      this.setData({ historyCandidates: candidates,
        historySelectedCount: candidates.filter(item => item.selected).length });
    } catch (error) {
      if (seq !== this.historySeq || !mealContext.isCurrent(app, context)) return;
      if (['FORBIDDEN', 'MEMBERSHIP_INACTIVE'].includes(error.code)) {
        this.setData({ isAdmin: false, historyCandidates: [], historyOpen: false });
        return this.onShow();
      }
      this.setData({ historyError: error.message || '历史候选载入失败' });
    } finally {
      if (seq === this.historySeq) this.setData({ historyLoading: false });
    }
  },
  onToggleHistorySelection(e) {
    if (this.data.batchRunning) return;
    const id = e.currentTarget.dataset.id;
    const candidates = this.data.historyCandidates.map(item => item.id === id
      ? { ...item, selected: !item.selected } : item);
    this.setData({ historyCandidates: candidates,
      historySelectedCount: candidates.filter(item => item.selected).length });
  },
  onSelectAllHistory() {
    if (this.data.batchRunning) return;
    const all = this.data.historySelectedCount !== this.data.historyCandidates.length;
    this.setData({ historyCandidates: this.data.historyCandidates.map(item => ({ ...item, selected: all })),
      historySelectedCount: all ? this.data.historyCandidates.length : 0 });
  },
  async onPrepareHistoryBatch() {
    const context = this.currentWriteContext();
    const selected = this.data.historyCandidates.filter(item => item.selected);
    if (!context || !selected.length || this.data.batchRunning) return;
    const seq = this.historySeq;
    const previews = [], results = [];
    this.setData({ batchRunning: true, historyResults: [], historyError: '' });
    try {
      for (const item of selected) {
        if (seq !== this.historySeq || !mealContext.isCurrent(app, context) || !this.data.isAdmin) return;
        if (deletionState.has(context.userId, context.familyId, item.id, item.version)) {
          results.push({ id: item.id, name: item.name, status: '结果待核对',
            reason: '请先使用逐项核对并清理入口查询结果' });
          continue;
        }
        try {
          const preview = await Services.getDishDeletionPreview(context.familyId, item.id);
          if (!preview || preview.dishId !== item.id || preview.expectedVersion !== item.version)
            throw new Error('版本已变化，请刷新候选');
          previews.push(preview);
        } catch (error) {
          if (['FORBIDDEN', 'MEMBERSHIP_INACTIVE'].includes(error.code)) {
            this.setData({ isAdmin: false, historyCandidates: [], batchPreview: null });
            return this.onShow();
          }
          results.push({ id: item.id, name: item.name, status: '预览失败', reason: error.message || '请刷新候选' });
        }
      }
      if (seq !== this.historySeq || !mealContext.isCurrent(app, context) || !this.data.isAdmin) return;
      const sum = key => previews.reduce((total, item) => total + (item[key] || 0), 0);
      this.batchContext = context;
      this.setData({ historyResults: results, batchPreview: previews.length ? {
        items: previews, dishCount: previews.length, variantCount: sum('variantCount'),
        cartItemCount: sum('cartItemCount'), submittedItemCount: sum('submittedItemCount'),
        menuItemCount: sum('menuItemCount'), imageCount: previews.filter(item => item.hasImage).length
      } : null });
    } finally {
      if (seq === this.historySeq) this.setData({ batchRunning: false });
    }
  },
  onCancelHistoryBatch() {
    if (this.data.batchRunning) return;
    this.batchContext = null;
    this.setData({ batchPreview: null });
  },
  async onConfirmHistoryBatch() {
    const context = this.batchContext, batch = this.data.batchPreview;
    if (!context || !batch || this.data.batchRunning || !this.data.isAdmin ||
        !mealContext.isCurrent(app, context)) return;
    const seq = this.historySeq;
    const results = [...this.data.historyResults];
    this.setData({ batchRunning: true });
    for (const item of batch.items) {
      if (seq !== this.historySeq || !mealContext.isCurrent(app, context) || !this.data.isAdmin) break;
      try {
        await Services.deleteDish(context.familyId, item.dishId, item.expectedVersion);
        results.push({ id: item.dishId, name: item.name, status: '已清理', reason: '' });
      } catch (error) {
        if (seq !== this.historySeq || !mealContext.isCurrent(app, context) || !this.data.isAdmin) break;
        if (['FORBIDDEN', 'MEMBERSHIP_INACTIVE'].includes(error.code)) {
          this.setData({ isAdmin: false, historyCandidates: [], batchPreview: null });
          return this.onShow();
        }
        const uncertain = !error.statusCode || error.statusCode >= 500 ||
          ['NETWORK_ERROR', 'REQUEST_IN_PROGRESS', 'INTERNAL_ERROR'].includes(error.code);
        if (uncertain) {
          deletionState.mark(context.userId, context.familyId, item.dishId, item.expectedVersion);
          try {
            await Services.getDishDeletionPreview(context.familyId, item.dishId);
            results.push({ id: item.dishId, name: item.name, status: '结果待核对', reason: '菜品仍可查询，未重复提交删除' });
          } catch (checkError) {
            if (checkError.statusCode === 404)
              deletionState.clear(context.userId, context.familyId, item.dishId, item.expectedVersion);
            results.push({ id: item.dishId, name: item.name,
              status: checkError.statusCode === 404 ? '已清理' : '结果待核对',
              reason: checkError.statusCode === 404 ? '' : '查询失败，未重复提交删除' });
          }
          break;
        }
        results.push({ id: item.dishId, name: item.name, status: '失败', reason: error.message || '服务端拒绝清理' });
      }
    }
    const reported = new Set(results.map(item => item.id));
    batch.items.filter(item => !reported.has(item.dishId)).forEach(item =>
      results.push({ id: item.dishId, name: item.name, status: '未执行', reason: '请核对前一项结果后再操作' }));
    if (seq === this.historySeq && mealContext.isCurrent(app, context) && this.data.isAdmin) {
      this.batchContext = null;
      this.setData({ batchRunning: false, batchPreview: null, historyResults: results,
        historyCandidates: this.data.historyCandidates.map(item => ({ ...item, selected: false })),
        historySelectedCount: 0 });
      this.loadHistoryCandidates();
    }
  },
  async onToggleFileCleanup() {
    if (!this.data.isAdmin) return;
    if (this.data.fileCleanupOpen) {
      this.fileCleanupSeq = (this.fileCleanupSeq || 0) + 1;
      this.setData({ fileCleanupOpen: false, fileCandidates: [], fileCleanupLoading: false });
      return;
    }
    this.setData({ fileCleanupOpen: true });
    return this.loadFileCleanupCandidates();
  },
  async loadFileCleanupCandidates() {
    const context = this.currentWriteContext();
    if (!context || !this.data.fileCleanupOpen) return;
    const seq = this.fileCleanupSeq = (this.fileCleanupSeq || 0) + 1;
    this.setData({ fileCleanupLoading: true, fileCleanupError: '' });
    try {
      const result = await Services.listFileCleanupCandidates(context.familyId);
      if (seq !== this.fileCleanupSeq || !this.data.isAdmin || !mealContext.isCurrent(app, context)) return;
      const old = new Map((this.data.fileCandidates || []).map(item => [item.fileId, item]));
      const candidates = await Promise.all((result.items || []).map(async item => ({
        ...item, createdAtText: beijingTime(item.createdAt),
        thumbnailUrl: await Services.getFile(context.familyId, item.fileId).then(file => file.url).catch(() => ''),
        sizeText: `${(item.sizeBytes / 1024 / 1024).toFixed(2)} MB`,
        taskId: item.taskId || (old.get(item.fileId) || {}).taskId || '',
        taskStatus: item.taskStatus || (old.get(item.fileId) || {}).taskStatus || '',
        failureText: item.taskStatus === 'FAILED' || item.taskStatus === 'SKIPPED'
          ? (old.get(item.fileId) || {}).failureText || '请刷新任务状态查看具体原因。' : ''
      })));
      if (seq !== this.fileCleanupSeq || !this.data.isAdmin || !mealContext.isCurrent(app, context)) return;
      this.setData({ fileCandidates: candidates });
      const uncertain = candidates.find(item => item.fileId === this.data.fileCleanupUncertain && item.taskId);
      if (uncertain) await this.refreshFileCleanupTask(context, uncertain.fileId, uncertain.taskId);
    } catch (error) {
      if (seq === this.fileCleanupSeq && mealContext.isCurrent(app, context)) {
        if (['FORBIDDEN', 'MEMBERSHIP_INACTIVE'].includes(error.code)) {
          this.setData({ isAdmin: false, fileCleanupOpen: false, fileCandidates: [] });
          return this.onShow();
        }
        this.setData({ fileCleanupError: error.message || '图片候选载入失败' });
      }
    } finally {
      if (seq === this.fileCleanupSeq) this.setData({ fileCleanupLoading: false });
    }
  },
  onThumbnailError(e) {
    const fileId = e.currentTarget.dataset.id;
    this.setData({ fileCandidates: this.data.fileCandidates.map(item => item.fileId === fileId ? { ...item, thumbnailUrl: '' } : item) });
  },
  onRequestFileCleanup(e) {
    const context = this.currentWriteContext();
    const fileId = e.currentTarget.dataset.id;
    const item = (this.data.fileCandidates || []).find(file => file.fileId === fileId);
    if (!context || !item || !item.canCleanup || this.data.fileCleanupBusy ||
        this.data.fileCleanupUncertain === fileId) return;
    wx.showModal({ title: '确认清理这张图片？',
      content: '仅清理当前没有菜品或头像引用的文件。提交后请查看任务状态。',
      confirmText: '清理', success: result => {
        if (result.confirm && mealContext.isCurrent(app, context) && this.data.isAdmin)
          this.requestFileCleanup(context, fileId);
      } });
  },
  async requestFileCleanup(context, fileId) {
    if (this.data.fileCleanupBusy || !mealContext.isCurrent(app, context) || !this.data.isAdmin) return;
    const seq = this.fileCleanupSeq;
    this.setData({ fileCleanupBusy: fileId, fileCleanupError: '' });
    try {
      const accepted = await Services.requestFileCleanup(context.familyId, fileId);
      if (seq !== this.fileCleanupSeq || !mealContext.isCurrent(app, context) || !this.data.isAdmin) return;
      if (!accepted || !accepted.taskId) throw new Error('未收到清理任务编号，请核对状态');
      this.setData({ fileCandidates: this.data.fileCandidates.map(item => item.fileId === fileId
        ? { ...item, taskId: accepted.taskId, taskStatus: 'PENDING' } : item) });
      await this.refreshFileCleanupTask(context, fileId, accepted.taskId);
    } catch (error) {
      if (seq !== this.fileCleanupSeq || !mealContext.isCurrent(app, context)) return;
      if (['FORBIDDEN', 'MEMBERSHIP_INACTIVE'].includes(error.code)) {
        this.setData({ isAdmin: false, fileCleanupOpen: false, fileCandidates: [] });
        return this.onShow();
      }
      const uncertain = !error.statusCode || error.statusCode >= 500 ||
        ['NETWORK_ERROR', 'REQUEST_IN_PROGRESS', 'INTERNAL_ERROR'].includes(error.code);
      this.setData({ fileCleanupError: uncertain ? '申请结果待核对，请刷新候选查看任务状态。' :
        (error.message || '申请失败，请核对候选状态。'),
        fileCleanupUncertain: uncertain ? fileId : '' });
    } finally {
      if (seq === this.fileCleanupSeq) this.setData({ fileCleanupBusy: '' });
    }
  },
  onRefreshFileCleanupTask(e) {
    const context = this.currentWriteContext();
    const { id, taskid } = e.currentTarget.dataset;
    if (context && id && taskid) return this.refreshFileCleanupTask(context, id, taskid);
  },
  async refreshFileCleanupTask(context, fileId, taskId) {
    const seq = this.fileCleanupSeq;
    try {
      const task = await Services.getFileCleanupTask(context.familyId, taskId);
      if (seq !== this.fileCleanupSeq || !mealContext.isCurrent(app, context) || !this.data.isAdmin) return;
      this.setData({ fileCandidates: this.data.fileCandidates.map(item => item.fileId === fileId
        ? { ...item, taskStatus: task.status, taskId,
          failureText: task.status === 'FAILED' || task.status === 'SKIPPED'
            ? cleanupFailureText(task.lastErrorCode) : '' } : item),
        fileCleanupError: '',
        fileCleanupUncertain: this.data.fileCleanupUncertain === fileId &&
          ['COMPLETED', 'FAILED', 'SKIPPED'].includes(task.status) ? '' : this.data.fileCleanupUncertain });
    } catch (error) {
      if (seq === this.fileCleanupSeq && mealContext.isCurrent(app, context)) {
        if (['FORBIDDEN', 'MEMBERSHIP_INACTIVE'].includes(error.code)) {
          this.setData({ isAdmin: false, fileCleanupOpen: false, fileCandidates: [] });
          return this.onShow();
        }
        this.setData({ fileCleanupError: error.message || '任务状态查询失败' });
      }
    }
  },

  async onDelete(e) {
    const context = this.currentWriteContext();
    if (!context) return;
    const { id, version } = e.currentTarget.dataset;
    if (!id || !Number.isInteger(Number(version)) || this.data.deleting) return;
    const identity = mealContext.capture(app);
    const seq = this.deleteSeq = (this.deleteSeq || 0) + 1;
    const active = () => seq === this.deleteSeq && this.data.isAdmin &&
      mealContext.sameIdentity(app, identity) && mealContext.isCurrent(app, context);
    this.setData({ deleting: true, deletePreview: null, deleteError: '', deleteBlocked: false });
    try {
      const preview = await Services.getDishDeletionPreview(context.familyId, id);
      if (!active()) return;
      if (!preview || preview.dishId !== id || !Number.isInteger(preview.expectedVersion))
        throw new Error('删除预览缺少菜品或版本');
      if (preview.expectedVersion !== Number(version))
        throw new Error('菜品已更新，请刷新列表后再删除');
      this.deleteContext = context;
      const blocked = deletionState.has(identity.userId, context.familyId, id, preview.expectedVersion);
      this.setData({ deletePreview: preview, deleteBlocked: blocked,
        deleteError: blocked ? '上次删除结果待核对，请先核对结果。' : '' });
    } catch (err) {
      if (active()) wx.showToast({ title: err.message || '删除预览载入失败', icon: 'none' });
    } finally {
      if (active()) this.setData({ deleting: false });
    }
  },
  onCancelDishDelete() {
    if (this.data.deleting) return;
    this.deleteContext = null;
    this.setData({ deletePreview: null, deleteError: '', deleteBlocked: false });
  },
  async onConfirmDishDelete() {
    const context = this.deleteContext, preview = this.data.deletePreview;
    const seq = this.deleteSeq;
    if (!preview || !context || this.data.deleting || this.data.deleteBlocked ||
        !this.data.isAdmin || !mealContext.isCurrent(app, context)) return;
    this.setData({ deleting: true, deleteError: '' });
    try {
      await Services.deleteDish(context.familyId, preview.dishId, preview.expectedVersion);
      if (seq !== this.deleteSeq || !mealContext.isCurrent(app, context) || !this.data.isAdmin) return;
      this.deleteContext = null;
      this.setData({ deletePreview: null });
      wx.showToast({ title: '菜品已删除', icon: 'success' });
      if (this.data.historyOpen) this.loadHistoryCandidates();
    } catch (err) {
      if (seq !== this.deleteSeq || !mealContext.isCurrent(app, context) || !this.data.isAdmin) return;
      if (['FORBIDDEN', 'MEMBERSHIP_INACTIVE'].includes(err.code)) {
        this.setData({ isAdmin: false, deletePreview: null });
        return this.onShow();
      }
      const uncertain = !err.statusCode || err.statusCode >= 500 ||
        ['NETWORK_ERROR', 'REQUEST_IN_PROGRESS', 'INTERNAL_ERROR'].includes(err.code);
      if (uncertain) deletionState.mark(context.userId, context.familyId, preview.dishId, preview.expectedVersion);
      this.setData({ deleteBlocked: true,
        deleteError: uncertain ? '删除结果待核对，请关闭后刷新列表。' :
          (err.code === 'VERSION_CONFLICT' ? '菜品已更新，请刷新列表后再删除。' : (err.message || '删除失败，请刷新列表。')) });
    } finally {
      if (seq === this.deleteSeq && mealContext.isCurrent(app, context)) this.setData({ deleting: false });
    }
  },
  async onReconcileDishDelete() {
    const context = this.deleteContext, preview = this.data.deletePreview;
    const seq = this.deleteSeq;
    if (!context || !preview || !this.data.deleteBlocked || this.data.deleting ||
        !this.data.isAdmin || !mealContext.isCurrent(app, context)) return;
    this.setData({ deleting: true });
    try {
      const current = await Services.getDishDeletionPreview(context.familyId, preview.dishId);
      if (seq !== this.deleteSeq || !this.data.isAdmin || !mealContext.isCurrent(app, context)) return;
      if (!current || !Number.isInteger(current.expectedVersion)) throw new Error('核对结果缺少版本');
      deletionState.clear(context.userId, context.familyId, preview.dishId, preview.expectedVersion);
      if (current.expectedVersion === preview.expectedVersion) {
        this.setData({ deletePreview: current, deleteBlocked: false, deleteError: '' });
      } else {
        this.setData({ deletePreview: null, deleteError: '' });
        wx.showToast({ title: '菜品版本已变化，请刷新列表', icon: 'none' });
        if (this.data.historyOpen) this.loadHistoryCandidates();
      }
    } catch (err) {
      if (seq !== this.deleteSeq || !this.data.isAdmin || !mealContext.isCurrent(app, context)) return;
      if (['FORBIDDEN', 'MEMBERSHIP_INACTIVE'].includes(err.code)) {
        this.setData({ isAdmin: false, deletePreview: null });
        return this.onShow();
      }
      if (err.statusCode === 404) {
        deletionState.clear(context.userId, context.familyId, preview.dishId, preview.expectedVersion);
        this.setData({ deletePreview: null, deleteError: '' });
        if (this.data.historyOpen) this.loadHistoryCandidates();
      } else this.setData({ deleteError: err.message || '核对失败，请稍后重试' });
    } finally {
      if (seq === this.deleteSeq && mealContext.isCurrent(app, context)) this.setData({ deleting: false });
    }
  }
}));
