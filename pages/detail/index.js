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
    Promise.all([api.getMatch(this._matchId), api.getProfile()]).then(async ([match, profile]) => {
      const hasVenueLocation = Number.isFinite(Number(match.venueLatitude)) && Number.isFinite(Number(match.venueLongitude))
        && match.venueLatitude !== '' && match.venueLongitude !== ''
        && match.venueLatitude != null && match.venueLongitude != null;
      const isHost = profile.userId != null && match.hostUserId != null && String(profile.userId) === String(match.hostUserId);
      // 与列表共用本地选择的位置，距离为直线估算值。
      const userLocation = locationStore.getUserLocation();
      const distance = locationStore.distanceKm(userLocation, { latitude: match.venueLatitude, longitude: match.venueLongitude });
      const distanceLabel = Number.isFinite(distance) ? `距你 ${locationStore.formatDistance(distance)}` : '';
      let contactSharing = null;
      let contactSharingError = false;
      if (match.status === 'matched') {
        try { contactSharing = await api.getMatchContactSharing(match.id); } catch (_) { contactSharingError = true; }
      }
      this.setData({ match, isHost, contactSharing, contactSharingError, hasVenueLocation, hasUserLocation: Boolean(userLocation), distanceLabel, markers: hasVenueLocation ? [{ id: 1, latitude: Number(match.venueLatitude), longitude: Number(match.venueLongitude), width: 26, height: 34, title: match.venue }] : [] });
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

  toggleContactSharing() {
    const match = this.data.match;
    const sharing = this.data.contactSharing;
    if (!match || !sharing) return;
    if (!sharing.canShare && !sharing.shared) {
      wx.showModal({ title: '先填写微信号', content: '请先到「我的-个人资料」填写微信号，再回来授权本场对方查看。', showCancel: false });
      return;
    }
    const next = !sharing.shared;
    const update = () => api.setMatchContactSharing(match.id, next).then(() => api.getMatchContactSharing(match.id)).then((contactSharing) => {
      this.setData({ contactSharing });
      wx.showToast({ title: next ? '已授权本场查看' : '已撤回本场授权', icon: 'none' });
    }).catch((error) => wx.showToast({ title: error.message || '操作失败，请重试', icon: 'none' }));
    if (next) {
      wx.showModal({
        title: '授权分享微信号',
        content: '仅向本场已确认组局的对方展示你的微信号，对方可复制保存。复制后无法收回副本，确定授权吗？',
        confirmText: '确认授权',
        success: (result) => { if (result.confirm) update(); }
      });
    } else {
      wx.showModal({ title: '撤回本场授权？', content: '撤回后对方将不能再从本场详情查看你的微信号；已复制的信息无法收回。', confirmText: '撤回授权', success: (result) => { if (result.confirm) update(); } });
    }
  },

  copyPeerWechatId() {
    const wechatId = this.data.contactSharing && this.data.contactSharing.peerWechatId;
    if (!wechatId) return;
    wx.setClipboardData({ data: wechatId, success: () => wx.showToast({ title: '微信号已复制', icon: 'success' }) });
  },

  openWechatProfile() { wx.navigateTo({ url: '/pages/personal-profile/index?section=personal' }); },

  openHostProfile(event) {
    const userId = event.currentTarget.dataset.userId;
    if (!userId) return;
    wx.navigateTo({ url: `/pages/user-profile/index?id=${encodeURIComponent(userId)}` });
  },

  openMap() {
    locationStore.openVenueLocation(this.data.match);
  }
});
