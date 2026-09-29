const Services = require('../../api/services.js');
const util = require('../../utils/util.js');

Page(require('../../api/page.js')({
  data: { operations: [], loading: false, error: '' },
  onShow() { return this.loadAudit(); },
  async loadAudit() {
    const access = this.captureAdminAccess();
    if (!access) return;
    const seq = this.auditLoadSeq = (this.auditLoadSeq || 0) + 1;
    const active = () => seq === this.auditLoadSeq && this.isAdminAccessCurrent(access);
    this.setData({ operations: [], loading: true, error: '' });
    try {
      const byId = new Map();
      let expectedTotal = null;
      for (let page = 1; ; page++) {
        const result = await Services.listOperations(access.familyId, undefined, page);
        if (!active()) return;
        if (!Number.isInteger(result.total) || result.total < 0 ||
            (expectedTotal !== null && result.total !== expectedTotal)) {
          throw new Error('审计记录在加载时发生变化，请重试');
        }
        expectedTotal = result.total;
        const batch = result.items || [];
        for (const operation of batch) if (operation && operation.id) byId.set(operation.id, operation);
        if (byId.size >= expectedTotal) break;
        if (!batch.length || page > Math.ceil(expectedTotal / 100) + 1) {
          throw new Error('审计记录在加载时发生变化，请重试');
        }
      }
      if (!active()) return;
      this.setData({ operations: [...byId.values()].map(operation => ({
        ...operation,
        summaryText: operation.summary && operation.summary !== operation.action
          ? operation.summary : '旧记录未保存对象详情',
        categoryText: operation.summary && operation.summary !== operation.action ? '业务记录' : '旧记录',
        createdAtText: util.formatBeijingDateTime(operation.createdAt) || '时间待核对'
      })) });
    } catch (error) {
      if (active() && !this.handleAdminError(error)) {
        this.setData({ operations: [], error: error.message || '审计加载失败，请重试' });
      }
    } finally {
      if (active()) this.setData({ loading: false });
    }
  }
}));
