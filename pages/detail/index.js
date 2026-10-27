const api = require('../../data/api');

Page({
  data: {
    match: null
  },

  onLoad(query) {
    api.getMatch(query.id).then((match) => {
      const hasVenueLocation = Number.isFinite(Number(match.venueLatitude)) && Number.isFinite(Number(match.venueLongitude))
        && match.venueLatitude !== '' && match.venueLongitude !== '';
      this.setData({ match, hasVenueLocation, markers: hasVenueLocation ? [{ id: 1, latitude: Number(match.venueLatitude), longitude: Number(match.venueLongitude), title: match.venue }] : [] });
    }).catch((error) => wx.showToast({ title: error.message || '这场约局暂不可用', icon: 'none' }));
  },

  openChat() {
    wx.showToast({ title: '聊天服务尚未接入', icon: 'none' });
  },

  openHostProfile(event) {
    const userId = event.currentTarget.dataset.userId;
    if (!userId) return;
    wx.navigateTo({ url: `/pages/user-profile/index?id=${encodeURIComponent(userId)}` });
  },

  openMap() {
    if (!this.data.hasVenueLocation) {
      wx.showToast({ title: '该球房暂无地图坐标', icon: 'none' });
      return;
    }
    wx.openLocation({
      latitude: Number(this.data.match.venueLatitude),
      longitude: Number(this.data.match.venueLongitude),
      name: this.data.match.venue || '约球球房',
      address: this.data.match.venueAddress || this.data.match.area || '',
      scale: 16,
      fail: () => wx.showToast({ title: '暂时无法打开地图', icon: 'none' })
    });
  }
});
