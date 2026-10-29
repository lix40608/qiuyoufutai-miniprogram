const navigation = require('../../data/navigation');
const api = require('../../data/api');
const locationStore = require('../../data/location-store');

Page({
  data: {
    match: null
  },

  onLoad(query) { this._matchId = query.id; },

  onShow() {
    // 同时读取当前用户，避免发起人看到参与自己约局的操作。
    Promise.all([api.getMatch(this._matchId), api.getProfile()]).then(([match, profile]) => {
      const hasVenueLocation = Number.isFinite(Number(match.venueLatitude)) && Number.isFinite(Number(match.venueLongitude))
        && match.venueLatitude !== '' && match.venueLongitude !== ''
        && match.venueLatitude != null && match.venueLongitude != null;
      const isHost = profile.userId != null && match.hostUserId != null && String(profile.userId) === String(match.hostUserId);
      // 与列表共用本地选择的位置，距离为直线估算值。
      const userLocation = locationStore.getUserLocation();
      const distance = locationStore.distanceKm(userLocation, { latitude: match.venueLatitude, longitude: match.venueLongitude });
      const distanceLabel = Number.isFinite(distance) ? `距你 ${locationStore.formatDistance(distance)}` : '';
      this.setData({ match, isHost, hasVenueLocation, hasUserLocation: Boolean(userLocation), distanceLabel, markers: hasVenueLocation ? [{ id: 1, latitude: Number(match.venueLatitude), longitude: Number(match.venueLongitude), title: match.venue }] : [] });
    }).catch((error) => wx.showToast({ title: error.message || '这场约局暂不可用', icon: 'none' }));
  },

  chooseLocation() {
    locationStore.chooseUserLocation((userLocation) => {
      const match = this.data.match;
      const distance = locationStore.distanceKm(userLocation, { latitude: match.venueLatitude, longitude: match.venueLongitude });
      this.setData({ hasUserLocation: Boolean(userLocation), distanceLabel: Number.isFinite(distance) ? `距你 ${locationStore.formatDistance(distance)}` : '' });
    });
  },

  openChat(event) { navigation.openChat(this, event); },

  openHostProfile(event) {
    const userId = event.currentTarget.dataset.userId;
    if (!userId) return;
    wx.navigateTo({ url: `/pages/user-profile/index?id=${encodeURIComponent(userId)}` });
  },

  openMap() {
    locationStore.openVenueLocation(this.data.match);
  }
});
