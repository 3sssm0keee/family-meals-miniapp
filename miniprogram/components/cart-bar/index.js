Component({
  properties: {
    selectedCount: { type: Number, value: 0 }
  },
  methods: {
    onTapCart() {
      this.triggerEvent('openCart');
    },
    onTapSubmit() {
      this.triggerEvent('submit');
    }
  }
});