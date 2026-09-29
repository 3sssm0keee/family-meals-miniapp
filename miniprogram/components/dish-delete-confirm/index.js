Component({
  properties: {
    preview: { type: Object, value: null },
    deleting: { type: Boolean, value: false },
    error: { type: String, value: '' },
    blocked: { type: Boolean, value: false }
  },
  methods: {
    onPreventClose() {},
    onConfirm() { this.triggerEvent('confirm'); },
    onReconcile() { this.triggerEvent('reconcile'); },
    onCancel() { this.triggerEvent('cancel'); }
  }
});
