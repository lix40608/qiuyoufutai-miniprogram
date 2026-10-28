const navigation = require('../../data/navigation');
const api = require('../../data/api');
const locationStore = require('../../data/location-store');

Page({
  data: {
    matches: [],
    selectedGameType: '中式八球',
    userLocation: null,
    locationLabel: '选择位置查看附近球友',
    loadError: ''
  },

  onShow() {
    const userLocation = locationStore.getUserLocation();
    this.setData({
      userLocation,
      locationLabel: userLocation ? userLocation.label : '选择位置查看附近球友'
    }, () => this.refreshMatches());
  },

  refreshMatches() {
    api.searchMatches({ userLocation: this.data.userLocation }).then((matches) => {
      this.setData({ matches: matches.slice(0, 2), loadError: '' });
    }).catch((error) => this.setData({ matches: [], loadError: error.message || '暂时无法连接服务' }));
  },

  openMatch(event) {
    const { id } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
  },

  openChat(event) { navigation.openChat(this, event); },

  showDeferredFeature(event) { navigation.openChat(this, event); },

  selectGameType(event) {
    const gameType = event.currentTarget.dataset.type;
    getApp().globalData.pendingGameType = gameType;
    wx.switchTab({ url: '/pages/find/index' });
  },

  showMessages() { navigation.openMessages(); },

  showLocation() {
    locationStore.openLocationActions((userLocation) => {
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
    wx.switchTab({ url: '/pages/publish/index' });
  },

  openHostProfile(event) {
    const userId = event.currentTarget.dataset.userId;
    if (!userId) return;
    wx.navigateTo({ url: `/pages/user-profile/index?id=${encodeURIComponent(userId)}` });
  }
});
