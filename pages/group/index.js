const api = require('../../data/api');
const resolveMatchChatRoute = require('../../data/match-chat-route');
const locationStore = require('../../data/location-store');
const unread = require('../../data/unread');
const conversationList = require('../../data/conversation-list');

Page({
  data: { loggedIn: false, activeView: 'created', loading: true, loadingMore: false, hasMore: true, page: 1, loadError: '', recentCreated: [], latestDraft: null, chatted: [] },

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

  async loadPage() {
    const requestId = this._requestId = (this._requestId || 0) + 1;
    const view = this.data.activeView;
    const userLocation = locationStore.getUserLocation();
    this.setData({ hasUserLocation: Boolean(userLocation), loading: true, loadError: '' });
    try {
      let rows;
      let latestDraft = this.data.latestDraft;
      if (view === 'created') {
        const results = await Promise.all([api.getMyMatches(1, 2, 'all'), api.getMyMatches(1, 1, 'draft')]);
        rows = results[0]; latestDraft = results[1][0] || null;
      } else rows = await api.getChattedMatches(1, 2, 'all');
      if (requestId !== this._requestId || view !== this.data.activeView) return;
      const recent = rows.slice(0, 2).map(item => {
        const distance = locationStore.distanceKm(userLocation, { latitude: item.venueLatitude, longitude: item.venueLongitude });
        const canCancel = item.status === 'matched' ? item.cancellationWindowOpen === true && (view === 'created' || item.won) : view === 'created' && item.status === 'recruiting' && !item.displayEnded;
        const lost = view === 'chatted' && item.status === 'matched' && !item.won;
        return Object.assign({}, item, {
          distanceLabel: Number.isFinite(distance) ? `距你 ${locationStore.formatDistance(distance)}` : '',
          chatUnreadCount: (this.data.unreadByMatchId || {})[String(item.id)] || 0,
          stateLabel: item.cancelReason === 'PARTICIPANT_DELETED' ? '已过期' : item.status === 'cancelled' ? '已取消' : lost ? '未组局' : item.status === 'matched' ? '已组局' : item.displayEnded ? '已过期' : '组局中',
          preview: conversationList.presentConversation(item).preview, canCancel
        });
      });
      this.setData(view === 'created' ? { recentCreated: recent, latestDraft, loading: false } : { chatted: recent, loading: false });
    } catch (error) {
      if (requestId === this._requestId) this.setData({ loading: false, loadError: error.message || '暂时无法加载约球' });
    }
  },

  openGuestLogin(event) { this.selectComponent('#loginGuide').open({ kind: event.currentTarget.dataset.kind || 'group' }); },
  selectView(event) { this.setData({ activeView: event.currentTarget.dataset.view }, () => this.refresh()); },
  chooseLocation() { locationStore.chooseUserLocation(() => this.refresh()); },
  openVenue(event) { locationStore.openVenueLocation(event.currentTarget.dataset.match); },
  publish() { if (!api.isLoggedIn()) { this._pendingPublish = true; this.selectComponent('#loginGuide').open({ kind: 'publish' }); return; } wx.navigateTo({ url: '/pages/publish/index' }); },
  browseMatches() { wx.switchTab({ url: '/pages/find/index' }); },
  allMatches() { wx.navigateTo({ url: `/pages/my-matches/index?view=${this.data.activeView === 'chatted' ? 'chatted' : 'created'}` }); },
  openConversation(event) { wx.navigateTo({ url: `/pages/chat/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }); },
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
  openRecord(event) {
    const { id, status, conversationId } = event.currentTarget.dataset;
    if (conversationId) return wx.navigateTo({ url: `/pages/chat/index?id=${encodeURIComponent(conversationId)}` });
    if (status === 'draft') return wx.navigateTo({ url: `/pages/publish/index?draftId=${encodeURIComponent(id)}` });
    wx.navigateTo({ url: `/pages/detail/index?id=${encodeURIComponent(id)}` });
  },
  cancelRecord(event) {
    const id = event.currentTarget.dataset.id;
    const record = this.data.recentCreated.find(item => String(item.id) === String(id));
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
