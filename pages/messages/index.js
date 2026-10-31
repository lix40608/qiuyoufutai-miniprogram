const api = require('../../data/api');

function activityTime(item) {
  return Math.max(Date.parse(item.lastMessageAt || '') || 0, Date.parse(item.hostConfirmedAt || '') || 0,
    Date.parse(item.guestConfirmedAt || '') || 0, Date.parse(item.createdAt || '') || 0);
}

function hasInteraction(item) {
  return Boolean(item.lastMessageAt || item.lastMessage || item.hostConfirmedAt || item.guestConfirmedAt || item.hostConfirmed || item.guestConfirmed);
}

function groupConversations(rows) {
  const groups = new Map();
  rows.filter(hasInteraction).forEach(item => {
    const key = String(item.matchId);
    const activity = activityTime(item);
    const confirmationTime = Math.max(Date.parse(item.hostConfirmedAt || '') || 0, Date.parse(item.guestConfirmedAt || '') || 0);
    const messageTime = Date.parse(item.lastMessageAt || '') || (item.lastMessage ? activity : 0);
    const preview = item.lastMessage && messageTime >= confirmationTime ? item.lastMessage
      : item.hostConfirmed && item.guestConfirmed ? '双方已确认组局' : '组局确认邀请';
    const row = Object.assign({}, item, {
      preview,
      timeLabel: activity ? new Date(activity).toLocaleString('zh-CN') : '',
      stateLabel: item.cancelReason === 'PARTICIPANT_DELETED' ? '已过期' : item.status === 'cancelled' ? '已取消' : item.displayEnded ? '已结束' : item.status === 'matched' ? (item.won ? '已组局' : '本次未组局') : '沟通中'
    });
    let group = groups.get(key);
    if (!group) {
      group = { matchId: item.matchId, gameType: item.gameType || '约球', venueName: item.venueName || '', startsAt: item.startsAt || '', statusLabel: row.stateLabel, conversations: [], unreadCount: 0, activityAt: 0 };
      groups.set(key, group);
    }
    group.conversations.push(row);
    group.unreadCount += Number(item.unreadCount) || 0;
    group.activityAt = Math.max(group.activityAt, activity);
  });
  return Array.from(groups.values()).map(group => Object.assign(group, {
    conversations: group.conversations.sort((a, b) => activityTime(b) - activityTime(a) || Number(b.id) - Number(a.id)),
    timeLabel: group.activityAt ? new Date(group.activityAt).toLocaleString('zh-CN') : ''
  })).sort((a, b) => b.activityAt - a.activityAt || Number(b.matchId) - Number(a.matchId));
}

Page({
  data: { activeTab: 'chat', conversations: [], conversationGroups: [], notifications: [], loading: true, loadError: '', notificationError: '', chatUnreadCount: 0, notificationUnreadCount: 0 },
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
      const conversationGroups = groupConversations(chatResult.status === 'fulfilled' ? chatResult.value : []);
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
