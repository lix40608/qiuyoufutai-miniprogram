const navigation = require('../../data/navigation');
const api = require('../../data/api');
const unread = require('../../data/unread');
const locationStore = require('../../data/location-store');

Page({
  data: {
    matches: [],
    currentUserId: null,
    selectedGameType: '中式八球',
    userLocation: null,
    locationLabel: '选择位置查看附近球友',
    isLoading: true,
    loadError: ''
  },

  onShow() {
    unread.start(this);
    api.getProfile().then(profile => this.setData({ currentUserId: profile.userId })).catch(() => this.setData({ currentUserId: null }));
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
    const requestId = this._requestId = (this._requestId || 0) + 1;
    this.setData({ isLoading: true });
    return api.searchMatches({ userLocation: this.data.userLocation }).then((matches) => {
      if (requestId === this._requestId) this.setData({ matches: matches.slice(0, 2), isLoading: false, loadError: '' });
    }).catch((error) => {
      if (requestId === this._requestId) this.setData({ matches: [], isLoading: false, loadError: error.message || '暂时无法连接服务' });
    });
  },

  onHide() { unread.stop(this); },
  onUnload() { unread.stop(this); this._requestId = (this._requestId || 0) + 1; },

  openMatch(event) {
    const { id } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
  },

  openChat(event) { navigation.openChat(this, event); },

  openVenue(event) { locationStore.openVenueLocation(event.currentTarget.dataset.match); },

  showDeferredFeature(event) { navigation.openChat(this, event); },

  selectGameType(event) {
    const gameType = event.currentTarget.dataset.type;
    getApp().globalData.pendingGameType = gameType;
    wx.switchTab({ url: '/pages/find/index' });
  },

  showMessages() { navigation.openMessages(); },

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
    wx.switchTab({ url: '/pages/find/index' });
  },

  goPublish() {
    wx.navigateTo({ url: '/pages/publish/index' });
  },

  openHostProfile(event) {
    const userId = event.currentTarget.dataset.userId;
    if (!userId) return;
    wx.navigateTo({ url: `/pages/user-profile/index?id=${encodeURIComponent(userId)}` });
  }
});
