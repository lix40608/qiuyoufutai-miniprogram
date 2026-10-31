const api = require('../../data/api');
const unread = require('../../data/unread');

Page({
  data: {
    views: [
      { label: '我发起的', value: 'created' },
      { label: '我聊过的', value: 'chatted' }
    ],
    filters: [
      { label: '全部', value: 'all' },
      { label: '编辑中', value: 'draft' },
      { label: '组局中', value: 'active' },
      { label: '已组局', value: 'matched' },
      { label: '已过期', value: 'expired' }
    ],
    activeView: 'created',
    activeFilter: 'all',
    loading: true,
    loadError: '',
    records: [],
    visibleRecords: [],
    page: 1,
    hasMore: true,
    loadingMore: false,
    unreadByMatchId: {}
  },

  onLoad(query) {
    if (query.filter === 'draft' || query.filter === 'active') this.setData({ activeView: 'created', activeFilter: query.filter });
  },

  onShow() {
    unread.start(this);
    this.refreshRecords();
  },
  onHide() { unread.stop(this); },

  onPullDownRefresh() {
    this.refreshRecords();
  },

  refreshRecords() {
    return this.loadRecords(1, false);
  },

  loadRecords(page, append) {
    const activeView = this.data.activeView;
    const requestId = this._requestId = (this._requestId || 0) + 1;
    this.setData(append ? { loadingMore: true } : { loading: true, loadingMore: false, loadError: '', page: 1, hasMore: true, records: [], visibleRecords: [] });
    const request = activeView === 'created'
      ? api.getMyMatches(page, 10, this.data.activeFilter)
      : api.getChattedMatches(page, 10);
    request.then((records) => {
      if (requestId !== this._requestId || this.data.activeView !== activeView) return;
      if (append && !records.length) return this.setData({ loadingMore: false, hasMore: false });
      const merged = (append ? this.data.records.concat(records) : records).map(item => Object.assign({}, item, {
        rowKey: activeView === 'chatted' ? `conversation-${item.conversationId}` : `match-${item.id}`,
        chatUnreadCount: (this.data.unreadByMatchId || {})[String(item.id)] || 0,
        stateLabel: item.cancelReason === 'PARTICIPANT_DELETED' ? '已过期' : item.status === 'draft' ? '编辑中' : item.status === 'cancelled' ? '已取消' : item.displayEnded ? '已过期' : item.status === 'matched' ? '已组局' : '组局中'
      }));
      this.setData({ records: merged, visibleRecords: this.filterRecords(merged), page, hasMore: records.length === 10, loading: false, loadingMore: false });
    }).catch((error) => {
      if (requestId !== this._requestId) return;
      this.setData(append ? { loadingMore: false } : { loading: false, loadError: error.message || '无法读取约局记录，请稍后重试。' });
    }).finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.loading && !this.data.loadingMore && this.data.hasMore) this.loadRecords(this.data.page + 1, true);
  },

  filterRecords(records) {
    return records.filter((record) => {
      if (this.data.activeView === 'chatted') return true;
      const participantDeleted = record.cancelReason === 'PARTICIPANT_DELETED';
      if (record.status === 'cancelled' && !participantDeleted) return false;
      if (this.data.activeFilter === 'all') return true;
      if (this.data.activeFilter === 'draft') return record.status === 'draft';
      if (this.data.activeFilter === 'expired') return participantDeleted || record.status !== 'draft' && record.displayEnded;
      if (this.data.activeFilter === 'matched') return record.status === 'matched' && !record.displayEnded;
      return record.status === 'recruiting' && !record.displayEnded;
    });
  },

  selectView(event) {
    this.setData({ activeView: event.currentTarget.dataset.value }, () => this.refreshRecords());
  },

  selectFilter(event) {
    this.setData({ activeFilter: event.currentTarget.dataset.value }, () => this.refreshRecords());
  },

  openRecord(event) {
    const { id, status, conversationId } = event.currentTarget.dataset;
    if (conversationId) return wx.navigateTo({ url: `/pages/chat/index?id=${conversationId}` });
    if (status === 'draft') {
      wx.navigateTo({ url: `/pages/publish/index?draftId=${encodeURIComponent(id)}` });
      return;
    }
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
  },
  openMatchChats(event) { wx.navigateTo({ url: `/pages/match-chats/index?matchId=${encodeURIComponent(event.currentTarget.dataset.id)}` }); },

  cancelRecord(event) {
    const { id } = event.currentTarget.dataset;
    const record = this.data.records.find(item => String(item.id) === String(id));
    if (!record || record.status !== 'recruiting' || record.displayEnded) return;
    wx.showModal({
      title: '取消这场约局？',
      content: '取消后将从当前列表隐藏，历史约局和已有聊天仍会保留，聊天停止发送与确认。',
      confirmText: '确认取消',
      cancelText: '继续招募',
      success: (result) => {
        if (!result.confirm) return;
        api.cancelMatch(id).then(() => {
          this.refreshRecords();
          wx.showToast({ title: '已取消', icon: 'success' });
        }).catch((error) => wx.showModal({ title: '取消失败', content: error.message || '服务暂时不可用，状态未更改。', showCancel: false }));
      }
    });
  },

  goPublish() {
    wx.navigateTo({ url: '/pages/publish/index' });
  }
});
