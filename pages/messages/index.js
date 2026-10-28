const api = require('../../data/api');
Page({
  data: { conversations: [], loading: true, loadError: '' },
  onShow() { this._active = true; this.refresh(); },
  onHide() { this._active = false; clearTimeout(this._timer); },
  onUnload() { this._destroyed = true; this._active = false; clearTimeout(this._timer); },
  onPullDownRefresh() { this.refresh(); },
  async refresh() {
    if (this._loading || !this._active) return;
    clearTimeout(this._timer);
    this._loading = true;
    try {
      const rows = await api.getConversations();
      if (!this._destroyed) this.setData({ conversations: rows.map(item => Object.assign({}, item, {
        timeLabel: new Date(item.lastMessageAt || item.createdAt).toLocaleString('zh-CN'),
        stateLabel: item.status === 'cancelled' ? '已取消' : item.status === 'matched' ? (item.won ? '已组局' : '本次未组局') : '沟通中'
      })), loading: false, loadError: '' });
    } catch (error) { if (!this._destroyed) this.setData({ loading: false, loadError: error.message || '暂时无法读取消息' }); }
    finally {
      this._loading = false;
      wx.stopPullDownRefresh();
      if (this._active && !this._destroyed) this._timer = setTimeout(() => this.refresh(), 5000);
    }
  },
  openConversation(event) { wx.navigateTo({ url: `/pages/chat/index?id=${event.currentTarget.dataset.id}` }); }
});
