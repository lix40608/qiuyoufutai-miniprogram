const navigation = require('../../data/navigation');
const api = require('../../data/api');
const unread = require('../../data/unread');
const locationStore = require('../../data/location-store');

Page({
  data: {
    matches: [],
    page: 1,
    hasMore: true,
    loadingMore: false,
    currentUserId: null,
    loggedIn: false,
    selectedGameType: '全部',
    userLocation: null,
    locationLabel: '选择位置查看附近球友',
    isLoading: true,
    loadError: ''
  },

  onShow() {
    const loggedIn = api.isLoggedIn();
    this.setData({ loggedIn, currentUserId: null });
    if (loggedIn) {
      unread.start(this);
      api.getProfile().then(profile => this.setData({ currentUserId: profile.userId })).catch(() => this.setData({ currentUserId: null, loggedIn: false }));
    } else unread.stop(this);
    const userLocation = locationStore.getUserLocation();
    this.setData({
      userLocation,
      locationLabel: userLocation ? userLocation.label : '选择位置查看附近球友'
    }, () => this.refreshMatches());
  },

  onPullDownRefresh() {
    // 下拉时同步本机位置，列表请求完成后结束系统刷新动画。
    const userLocation = locationStore.getUserLocation();
    this.setData({ userLocation, locationLabel: userLocation ? userLocation.label : '选择位置查看附近球友' });
    this.refreshMatches().finally(() => wx.stopPullDownRefresh());
  },

  refreshMatches() {
    return this.loadMatches(1, false);
  },

  loadMatches(page, append) {
    const requestId = this._requestId = (this._requestId || 0) + 1;
    this.setData(append ? { loadingMore: true } : { isLoading: true, loadError: '', page: 1, hasMore: true, matches: [] });
    const gameType = this.data.selectedGameType === '全部' ? '' : this.data.selectedGameType;
    return api.searchMatches({ gameType, userLocation: this.data.userLocation, page, pageSize: 10 }).then((rows) => {
      if (requestId !== this._requestId) return;
      if (append && !rows.length) return this.setData({ loadingMore: false, hasMore: false });
      const matches = (append ? this.data.matches.concat(rows) : rows).map(row => Object.assign({}, row, { chatUnreadCount: (this.data.unreadByMatchId || {})[String(row.id)] || 0 }));
      this.setData({ matches, page, hasMore: rows.length === 10, isLoading: false, loadingMore: false, loadError: '' });
    }).catch((error) => {
      if (requestId === this._requestId) this.setData(append
        ? { loadingMore: false }
        : { matches: [], isLoading: false, loadError: error.message || '暂时无法连接服务' });
    });
  },

  onReachBottom() {
    if (!this.data.isLoading && !this.data.loadingMore && this.data.hasMore) this.loadMatches(this.data.page + 1, true);
  },

  onHide() { unread.stop(this); },
  onUnload() { unread.stop(this); this._requestId = (this._requestId || 0) + 1; },

  openMatch(event) {
    const { id } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
  },

  openChat(event) {
    if (!api.isLoggedIn()) { this._pendingGuestAction = { type: 'chat', id: event.currentTarget.dataset.id, focus: event.currentTarget.dataset.focus }; this.selectComponent('#loginGuide').open({ kind: event.currentTarget.dataset.focus === 'confirm' ? 'match' : 'chat' }); return; }
    navigation.openChat(this, event);
  },

  openVenue(event) { locationStore.openVenueLocation(event.currentTarget.dataset.match); },

  showDeferredFeature(event) { this.openChat(event); },

  selectGameType(event) {
    const gameType = event.currentTarget.dataset.type;
    this.setData({ selectedGameType: gameType }, () => this.refreshMatches());
  },

  showMessages() { if (!api.isLoggedIn()) { this._pendingGuestAction = { type: 'messages' }; this.selectComponent('#loginGuide').open({ kind: 'messages' }); return; } navigation.openMessages(); },

  clearLocation() {
    locationStore.clearUserLocation();
    this.setData({ userLocation: null, locationLabel: '选择位置查看附近球友' }, () => this.refreshMatches());
  },

  showLocation() {
    locationStore.chooseUserLocation((userLocation) => {
      this.setData({
        userLocation,
        locationLabel: userLocation ? userLocation.label : '选择位置查看附近球友'
      }, () => this.refreshMatches());
    });
  },

  goFind() {
    getApp().globalData.pendingGameType = this.data.selectedGameType === '全部' ? '' : this.data.selectedGameType;
    wx.switchTab({ url: '/pages/find/index' });
  },

  goPublish() {
    if (!api.isLoggedIn()) { this._pendingGuestAction = { type: 'publish' }; this.selectComponent('#loginGuide').open({ kind: 'publish' }); return; }
    wx.navigateTo({ url: '/pages/publish/index' });
  },

  openHostProfile(event) {
    const userId = event.currentTarget.dataset.userId;
    if (!userId) return;
    if (!api.isLoggedIn()) { this._pendingGuestAction = { type: 'profile', userId }; this.selectComponent('#loginGuide').open({ kind: 'profile' }); return; }
    wx.navigateTo({ url: `/pages/user-profile/index?id=${encodeURIComponent(userId)}` });
  },

  onLoginSuccess() {
    this.setData({ loggedIn: true });
    const action = this._pendingGuestAction; this._pendingGuestAction = null;
    if (!action) return this.onShow();
    if (action.type === 'publish') return wx.navigateTo({ url: '/pages/publish/index' });
    if (action.type === 'messages') return navigation.openMessages();
    if (action.type === 'profile') return wx.navigateTo({ url: `/pages/user-profile/index?id=${encodeURIComponent(action.userId)}` });
    if (action.type === 'chat') return navigation.openChat(this, { currentTarget: { dataset: { id: action.id, focus: action.focus } } });
  }
});
