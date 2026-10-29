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
      const contactHint = match.status === 'cancelled'
        ? '约局已取消，无法联系对方。'
        : match.status === 'matched'
          ? '双方已确认组局；号码保护服务暂未开通，暂时无法拨打。'
          : match.displayEnded
            ? '本场招募已结束，未完成组局，暂时无法联系对方。'
            : '双方确认组局后，可通过隐私号码联系。';
      this.setData({ match, isHost, contactHint, hasVenueLocation, hasUserLocation: Boolean(userLocation), distanceLabel, markers: hasVenueLocation ? [{ id: 1, latitude: Number(match.venueLatitude), longitude: Number(match.venueLongitude), width: 26, height: 34, title: match.venue }] : [] });
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

  contactOther() {
    const match = this.data.match;
    if (!match) return;
    if (match.status === 'cancelled') {
      wx.showToast({ title: '约局已取消，无法联系对方', icon: 'none' });
    } else if (match.displayEnded && match.status !== 'matched') {
      wx.showModal({ title: '暂不可联系', content: '本场招募已结束，未完成双方确认，暂时无法联系对方。', showCancel: false, confirmText: '知道了' });
    } else if (match.status !== 'matched') {
      wx.showModal({ title: '暂不可联系', content: '双方确认组局后，可通过隐私号码联系对方。', showCancel: false, confirmText: '知道了' });
    } else {
      wx.showModal({ title: '联系功能暂未开通', content: '号码保护服务接入后，可在这里联系对方；双方真实手机号不会互相展示。', showCancel: false, confirmText: '知道了' });
    }
  },

  openHostProfile(event) {
    const userId = event.currentTarget.dataset.userId;
    if (!userId) return;
    wx.navigateTo({ url: `/pages/user-profile/index?id=${encodeURIComponent(userId)}` });
  },

  openMap() {
    locationStore.openVenueLocation(this.data.match);
  }
});
