Component({
  properties: {
    dish: { type: Object, value: {} },
    selectedVariantIds: {
      type: Array,
      value: [],
      observer(newVal) {
        const map = {};
        (newVal || []).forEach(id => { map[id] = true; });
        this.setData({ selectedVariantMap: map });
      }
    }
  },
  data: {
    selectedVariantMap: {}
  },
  methods: {
    onToggleVariant(e) {
      const variantId = e.currentTarget.dataset.id;
      this.triggerEvent('toggleVariant', {
        dishId: this.data.dish.id,
        variantId
      });
    }
  }
});