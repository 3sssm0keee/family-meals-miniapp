Component({
  properties: {
    dish: { type: Object, value: {} }
  },
  data: {
    quantityDrafts: {}
  },
  methods: {
    onQuantityInput(e) {
      const itemId = e.currentTarget.dataset.itemId;
      const val = e.detail.value;
      const drafts = { ...this.data.quantityDrafts, [itemId]: val };
      this.setData({ quantityDrafts: drafts });
      this.triggerEvent('quantityChange', { itemId, quantity: val });
    },

    onConfirm(e) {
      const itemId = e.currentTarget.dataset.itemId;
      let qty = this.data.quantityDrafts[itemId];
      if (qty === undefined || qty === '') {
        // 如果草稿未填，看原对象里是否有值
        const variant = (this.data.dish.variants || []).find(v => v.itemId === itemId);
        if (variant && variant.plannedQuantity !== null) {
          qty = variant.plannedQuantity;
        }
      }
      
      if (qty === undefined || qty === '' || isNaN(qty) || parseFloat(qty) <= 0) {
        wx.showToast({ title: '确认前请先填写制作份数', icon: 'none' });
        return;
      }

      this.triggerEvent('decision', {
        itemId,
        decision: 'CONFIRMED',
        plannedQuantity: parseFloat(parseFloat(qty).toFixed(1)),
        reason: ''
      });
    },

    onCancel(e) {
      const itemId = e.currentTarget.dataset.itemId;
      wx.showModal({
        title: '取消该规格',
        placeholderText: '请输入取消原因（必填）',
        editable: true,
        success: (res) => {
          if (res.confirm) {
            const reason = (res.content || '').trim();
            if (!reason) {
              wx.showToast({ title: '必须填写取消原因', icon: 'none' });
              return;
            }
            this.triggerEvent('decision', {
              itemId,
              decision: 'CANCELLED',
              plannedQuantity: null,
              reason
            });
          }
        }
      });
    }
  }
});