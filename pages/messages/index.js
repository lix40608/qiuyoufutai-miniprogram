const api = require('../../data/api');
const realtime = require('../../data/realtime');
const conversationList = require('../../data/conversation-list');

Page({
  data: { activeTab: 'chat', conversations: [], conversationGroups: [], notifications: [], loading: true, loadError: '', notificationError: '', chatUnreadCount: 0, notificationUnreadCount: 0 },
  onShow() { this._active = true; this._stopRealtime = realtime.subscribe(()=>this.refresh()); this.refresh(); },
  onHide() { this._active = false; if(this._stopRealtime)this._stopRealtime();this._stopRealtime=null;clearTimeout(this._timer); },
  onUnload() { this._destroyed = true; this._active = false; if(this._stopRealtime)this._stopRealtime();this._stopRealtime=null; clearTimeout(this._timer); },
  onPullDownRefresh() { this.refresh(); },
  async refresh() {
    if (!this._active) return;
    if(this._loading){this._refreshAgain=true;return;}
    clearTimeout(this._timer);
    this._loading = true;
    try {
      const [chatResult, notificationResult, notificationCountResult] = await Promise.allSettled([api.getConversations(), api.getNotifications(), api.getUnreadNotificationCount()]);
      const conversationGroups = conversationList.groupConversations(chatResult.status === 'fulfilled' ? chatResult.value : []);
      if (!this._destroyed) this.setData({ conversationGroups, conversations: conversationGroups.flatMap(group => group.conversations), notifications: (notificationResult.status === 'fulfilled' ? notificationResult.value : []).map(item => Object.assign({}, item, {
        timeLabel: new Date(item.createdAt).toLocaleString('zh-CN'), unread: !item.readAt
      })), chatUnreadCount: chatResult.status === 'fulfilled' ? conversationGroups.reduce((sum, item) => sum + item.unreadCount, 0) : 0,
      notificationUnreadCount: notificationCountResult.status === 'fulfilled' ? notificationCountResult.value : notificationResult.status === 'fulfilled' ? notificationResult.value.filter(item => !item.readAt).length : 0,
      loading: false, loadError: chatResult.status === 'rejected' ? (chatResult.reason.message || '暂时无法读取聊天') : '',
      notificationError: notificationResult.status === 'rejected' ? (notificationResult.reason.message || '暂时无法读取通知') : '' });
    } catch (error) { if (!this._destroyed) this.setData({ loading: false, loadError: error.message || '暂时无法读取消息' }); }
    finally {
      this._loading = false;
      wx.stopPullDownRefresh();
      if (this._active && !this._destroyed) this._timer = setTimeout(() => this.refresh(), this._refreshAgain ? 100 : 60000)
      this._refreshAgain=false;
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
