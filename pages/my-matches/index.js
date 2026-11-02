const api = require('../../data/api');
const resolveMatchChatRoute = require('../../data/match-chat-route');
const unread = require('../../data/unread');
const locationStore = require('../../data/location-store');

Page({
  data: {
    filters: [
      { label: '全部', value: 'all' },
      { label: '组局中', value: 'active' },
      { label: '已组局', value: 'matched' },
      { label: '已过期', value: 'expired' },
      { label: '已取消', value: 'cancelled' }
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
    const activeView = query.view === 'chatted' ? 'chatted' : 'created';
    const activeFilter = this.data.filters.some(item => item.value === query.filter) ? query.filter : 'all';
    this.setData({ activeView, activeFilter });
    wx.setNavigationBarTitle({ title: activeView === 'created' ? '发起记录' : '聊过记录' });
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
    const userLocation = locationStore.getUserLocation();
    this.setData({ hasUserLocation: Boolean(userLocation) });
    const requestId = this._requestId = (this._requestId || 0) + 1;
    this.setData(append ? { loadingMore: true } : { loading: true, loadingMore: false, loadError: '', page: 1, hasMore: true, records: [], visibleRecords: [] });
    const request = activeView === 'created'
      ? api.getMyMatches(page, 10, this.data.activeFilter)
      : api.getChattedMatches(page, 10, this.data.activeFilter);
    return request.then((records) => {
      if (requestId !== this._requestId || this.data.activeView !== activeView) return;
      if (append && !records.length) return this.setData({ loadingMore: false, hasMore: false });
      const merged = (append ? this.data.records.concat(records) : records).map(item => Object.assign({}, item, {
        distanceLabel: (() => {
          const distance = locationStore.distanceKm(userLocation, { latitude: item.venueLatitude, longitude: item.venueLongitude });
          return Number.isFinite(distance) ? `距你 ${locationStore.formatDistance(distance)}` : '';
        })(),
        rowKey: activeView === 'chatted' ? `conversation-${item.conversationId}` : `match-${item.id}`,
        chatUnreadCount: (this.data.unreadByMatchId || {})[String(item.id)] || 0,
        stateLabel: item.cancelReason === 'PARTICIPANT_DELETED' ? '已过期' : item.status === 'draft' ? '编辑中' : item.status === 'cancelled' ? '已取消' : item.status === 'matched' ? (activeView === 'chatted' && !item.won ? '未组局' : '已组局') : item.displayEnded ? '已过期' : '组局中',
        canCancel: item.status === 'matched'
          ? Boolean(item.cancellationWindowOpen === true && (activeView === 'created' || item.won))
          : activeView === 'created' && item.status === 'recruiting' && !item.displayEnded
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
    return records.filter(record => {
      if (record.status === 'draft') return false;
      const participantDeleted = record.cancelReason === 'PARTICIPANT_DELETED';
      const lost = this.data.activeView === 'chatted' && record.status === 'matched' && !record.won;
      if (this.data.activeFilter === 'all') return true;
      if (this.data.activeFilter === 'cancelled') return record.status === 'cancelled' && !participantDeleted;
      if (this.data.activeFilter === 'expired') return participantDeleted || lost || record.status === 'recruiting' && record.displayEnded;
      if (this.data.activeFilter === 'matched') return record.status === 'matched' && !lost;
      return record.status === 'recruiting' && !record.displayEnded;
    });
  },

  selectFilter(event) {
    this.setData({ activeFilter: event.currentTarget.dataset.value }, () => this.refreshRecords());
  },

  openRecord(event) {
    const { id, status, conversationId } = event.currentTarget.dataset;
    if (status === 'draft') {
      wx.navigateTo({ url: `/pages/publish/index?draftId=${encodeURIComponent(id)}` });
      return;
    }
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
  },
  openConversation(event) { wx.navigateTo({ url: `/pages/chat/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }); },
  chooseLocation() { locationStore.chooseUserLocation(() => this.refreshRecords()); },
  openVenue(event) { locationStore.openVenueLocation(event.currentTarget.dataset.match); },
  async openMatchChats(event) {
    if (this._openingMatchChats) return;
    this._openingMatchChats = true;
    try {
      const url = await resolveMatchChatRoute(api, event.currentTarget.dataset.id);
      wx.navigateTo({ url });
    } catch (error) {
      wx.showToast({ title: error.message || '暂时无法打开聊天', icon: 'none' });
    } finally { this._openingMatchChats = false; }
  },

  cancelRecord(event) {
    const { id, conversationId } = event.currentTarget.dataset;
    const record = this.data.records.find(item => String(item.id) === String(id)
      && (!conversationId || String(item.conversationId) === String(conversationId)));
    if (!record || !record.canCancel) return;
    if (record.status === 'matched') {
      this.selectComponent('#cancelMatchDialog').open(id);
      return;
    }
    if (record.status !== 'recruiting' || this.data.activeView !== 'created') return;
    wx.showModal({
      title: '取消这场约局？',
      content: '取消后将停止招募，历史约局和已有聊天仍会保留。',
      confirmText: '确认取消',
      cancelText: '继续招募',
      success: (result) => {
        if (!result.confirm) return;
        api.cancelMatch(id).then(() => {
          this.refreshRecords();
          wx.showToast({ title: '已取消', icon: 'success' });
        }).catch(error => wx.showModal({ title: '取消失败', content: error.message || '服务暂时不可用，状态未更改。', showCancel: false }));
      }
    });
  },

  onCancelSuccess() { this.refreshRecords(); wx.showToast({ title: '已取消', icon: 'success' }); },

  goPublish() {
    wx.navigateTo({ url: '/pages/publish/index' });
  }
});
