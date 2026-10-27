Page({
  data: {
    match: null,
    messages: [],
    draft: '',
    previewOnly: true
  },

  onLoad(query) {
    wx.showModal({ title: '聊天暂不可用', content: '聊天服务尚未接入，当前不会发送或保存消息。', showCancel: false, success: () => wx.navigateBack() });
  },

  onDraftInput(event) {
    this.setData({ draft: event.detail.value });
  },

  onKeyboardHeightChange(event) {
    if (event.detail.height > 0) {
      this.setData({ scrollTop: Date.now() });
    }
  },

  sendMessage() {
    wx.showToast({ title: '聊天服务尚未接入', icon: 'none' });
  },

  confirmMatch() {
    wx.showToast({ title: '组局确认服务尚未接入', icon: 'none' });
  },

  openDetail() {
    if (!this.data.match) return;
    wx.redirectTo({ url: `/pages/detail/index?id=${this.data.match.id}` });
  }
});
