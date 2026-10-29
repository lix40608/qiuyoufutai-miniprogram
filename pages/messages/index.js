const api = require('../../data/api');
Page({
  data: { activeTab: 'chat', conversations: [], notifications: [], loading: true, loadError: '', notificationError: '', chatUnreadCount: 0, notificationUnreadCount: 0 },
  onShow() { this._active = true; this.refresh(); },
  onHide() { this._active = false; clearTimeout(this._timer); },
  onUnload() { this._destroyed = true; this._active = false; clearTimeout(this._timer); },
  onPullDownRefresh() { this.refresh(); },
  async refresh() {
    if (this._loading || !this._active) return;
    clearTimeout(this._timer);
    this._loading = true;
    try {
      const [chatResult, notificationResult, notificationCountResult] = await Promise.allSettled([api.getConversations(), api.getNotifications(), api.getUnreadNotificationCount()]);
      if (!this._destroyed) this.setData({ conversations: (chatResult.status === 'fulfilled' ? chatResult.value : []).map(item => Object.assign({}, item, {
        timeLabel: new Date(item.lastMessageAt || item.createdAt).toLocaleString('zh-CN'),
        stateLabel: item.status === 'cancelled' ? '已取消' : item.status === 'matched' ? (item.won ? '已组局' : '本次未组局') : '沟通中'
      })), notifications: (notificationResult.status === 'fulfilled' ? notificationResult.value : []).map(item => Object.assign({}, item, {
        timeLabel: new Date(item.createdAt).toLocaleString('zh-CN'), unread: !item.readAt
      })), chatUnreadCount: chatResult.status === 'fulfilled' ? chatResult.value.reduce((sum, item) => sum + (Number(item.unreadCount) || 0), 0) : 0,
      notificationUnreadCount: notificationCountResult.status === 'fulfilled' ? notificationCountResult.value : notificationResult.status === 'fulfilled' ? notificationResult.value.filter(item => !item.readAt).length : 0,
      loading: false, loadError: chatResult.status === 'rejected' ? (chatResult.reason.message || '暂时无法读取聊天') : '',
      notificationError: notificationResult.status === 'rejected' ? (notificationResult.reason.message || '暂时无法读取通知') : '' });
    } catch (error) { if (!this._destroyed) this.setData({ loading: false, loadError: error.message || '暂时无法读取消息' }); }
    finally {
      this._loading = false;
      wx.stopPullDownRefresh();
      if (this._active && !this._destroyed) this._timer = setTimeout(() => this.refresh(), 15000);
    }
  },
  selectTab(event) { this.setData({ activeTab: event.currentTarget.dataset.tab }); },
  openConversation(event) { wx.navigateTo({ url: `/pages/chat/index?id=${event.currentTarget.dataset.id}` }); },
  async openNotification(event) {
    const id = event.currentTarget.dataset.id;
    const matchId = event.currentTarget.dataset.matchId;
    try { await api.markNotificationRead(id); } catch (_) {}
    if (this._active) this.refresh();
    if (matchId) wx.navigateTo({ url: `/pages/detail/index?id=${matchId}` });
  }
});
