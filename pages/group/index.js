const api = require('../../data/api');
const locationStore = require('../../data/location-store');
const unread = require('../../data/unread');

Page({
  data: { loggedIn: false, activeView: 'created', loading: true, loadingMore: false, hasMore: true, page: 1, loadError: '', latestActive: null, latestDraft: null, chatted: [] },

  onShow() {
    const loggedIn = api.isLoggedIn();
    this.setData({ loggedIn });
    if (!loggedIn) { unread.stop(this); this.setData({ loading: false }); return; }
    unread.start(this);
    const app = getApp();
    if (app.globalData.showCreatedMatches) {
      app.globalData.showCreatedMatches = false;
      this.setData({ activeView: 'created' });
    }
    this.refresh();
  },
  onHide() { unread.stop(this); },
  onUnload() { this._requestId = (this._requestId || 0) + 1; },

  refresh() {
    return this.loadPage(1, false);
  },

  loadPage(page, append) {
    const requestId = this._requestId = (this._requestId || 0) + 1;
    const view = this.data.activeView;
    const userLocation = locationStore.getUserLocation();
    this.setData({ hasUserLocation: Boolean(userLocation) });
    this.setData(append ? { loadingMore: true } : { loading: true, loadingMore: false, page: 1, hasMore: true, loadError: '', chatted: [] });
    const request = view === 'created'
      ? Promise.all([api.getMyMatches(1, 10, 'active'), api.getMyMatches(1, 10, 'matched'), api.getMyMatches(1, 10, 'draft')]).then(groups => groups[0].concat(groups[1], groups[2]))
      : api.getChattedMatches(page, 10);
    request.then((records) => {
      if (requestId !== this._requestId) return;
      if (append && !records.length) return this.setData({ loadingMore: false, hasMore: false });
      // 接口暂无发布时间，按更新时间倒序；草稿同样按最近编辑时间排序。
      const source = append ? this.data.chatted.concat(records) : records;
      const recent = source.map(item => {
        const distance = locationStore.distanceKm(userLocation, { latitude: item.venueLatitude, longitude: item.venueLongitude });
        const canCancel = item.status === 'matched' ? item.cancellationWindowOpen === true : item.status === 'recruiting' && !item.displayEnded;
        return Object.assign({}, item, { distanceLabel: Number.isFinite(distance) ? `距你 ${locationStore.formatDistance(distance)}` : '', chatUnreadCount: (this.data.unreadByMatchId || {})[String(item.id)] || 0, canCancel });
      }).sort((a, b) => (Date.parse(b.lastMessageAt || b.updatedAt) || 0) - (Date.parse(a.lastMessageAt || a.updatedAt) || 0) || Number(b.id) - Number(a.id));
      if (view === 'created') {
        this.setData({ latestActive: recent.find(item => item.status !== 'draft' && item.status !== 'cancelled' && (!item.displayEnded || item.status === 'matched' && item.canCancel)) || null, latestDraft: recent.find(item => item.status === 'draft') || null, loading: false });
      } else {
        this.setData({ chatted: recent, page, hasMore: records.length === 10, loading: false, loadingMore: false });
      }
    }).catch(error => { if (requestId === this._requestId) this.setData(append ? { loadingMore: false } : { loading: false, loadError: error.message || '暂时无法加载约球' }); });
  },

  onReachBottom() {
    if (this.data.activeView === 'chatted' && !this.data.loading && !this.data.loadingMore && this.data.hasMore) this.loadPage(this.data.page + 1, true);
  },

  openGuestLogin(event) { this.selectComponent('#loginGuide').open({ kind: event.currentTarget.dataset.kind || 'group' }); },
  selectView(event) { this.setData({ activeView: event.currentTarget.dataset.view }, () => this.refresh()); },
  chooseLocation() { locationStore.chooseUserLocation(() => this.refresh()); },
  openVenue(event) { locationStore.openVenueLocation(event.currentTarget.dataset.match); },
  publish() { if (!api.isLoggedIn()) { this._pendingPublish = true; this.selectComponent('#loginGuide').open({ kind: 'publish' }); return; } wx.navigateTo({ url: '/pages/publish/index' }); },
  browseMatches() { wx.switchTab({ url: '/pages/find/index' }); },
  allMatches() { wx.navigateTo({ url: '/pages/my-matches/index' }); },
  openConversation(event) { wx.navigateTo({ url: `/pages/chat/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }); },
  openMatchChats(event) { wx.navigateTo({ url: `/pages/match-chats/index?matchId=${encodeURIComponent(event.currentTarget.dataset.id)}` }); },
  openRecord(event) {
    const { id, status, conversationId } = event.currentTarget.dataset;
    if (conversationId) return wx.navigateTo({ url: `/pages/chat/index?id=${encodeURIComponent(conversationId)}` });
    if (status === 'draft') return wx.navigateTo({ url: `/pages/publish/index?draftId=${encodeURIComponent(id)}` });
    wx.navigateTo({ url: `/pages/detail/index?id=${encodeURIComponent(id)}` });
  },
  cancelRecord(event) {
    const id = event.currentTarget.dataset.id;
    const record = this.data.latestActive;
    if (!record || String(record.id) !== String(id) || !record.canCancel) return;
    if (record.status === 'matched') {
      this.selectComponent('#cancelMatchDialog').open(id);
      return;
    }
    if (record.status !== 'recruiting') return;
    wx.showModal({ title: '取消这场约局？', content: '取消后将停止招募，聊天不能继续发送或确认。', confirmText: '确认取消', cancelText: '继续招募', success: result => {
      if (!result.confirm) return;
      api.cancelMatch(id).then(() => { this.refresh(); wx.showToast({ title: '已取消', icon: 'success' }); }).catch(error => wx.showModal({ title: '取消失败', content: error.message || '服务暂时不可用，请重试。', showCancel: false }));
    } });
  },
  onCancelSuccess() { this.refresh(); wx.showToast({ title: '已取消', icon: 'success' }); },
  onLoginSuccess() { const publish = this._pendingPublish; this._pendingPublish = false; this.setData({ loggedIn: true }); if (publish) wx.navigateTo({ url: '/pages/publish/index' }); else this.onShow(); }
});
