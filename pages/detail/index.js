const navigation = require('../../data/navigation');
const api = require('../../data/api');
const locationStore = require('../../data/location-store');

Page({
  data: {
    match: null,
    loggedIn: false
  },

  onLoad(query) { this._matchId = query.id; },

  onShow() {
    // 同时读取当前用户，避免发起人看到参与自己约局的操作。
    const loggedIn = api.isLoggedIn();
    Promise.all([api.getMatch(this._matchId), loggedIn ? api.getProfile() : Promise.resolve(null)]).then(async ([match, profile]) => {
      const hasVenueLocation = Number.isFinite(Number(match.venueLatitude)) && Number.isFinite(Number(match.venueLongitude))
        && match.venueLatitude !== '' && match.venueLongitude !== ''
        && match.venueLatitude != null && match.venueLongitude != null;
      const isHost = Boolean(profile && profile.userId != null && match.hostUserId != null && String(profile.userId) === String(match.hostUserId));
      // 与列表共用本地选择的位置，距离为直线估算值。
      const userLocation = locationStore.getUserLocation();
      const distance = locationStore.distanceKm(userLocation, { latitude: match.venueLatitude, longitude: match.venueLongitude });
      const distanceLabel = Number.isFinite(distance) ? `距你 ${locationStore.formatDistance(distance)}` : '';
      let contactSharing = null;
      let contactSharingError = false;
      let matchConversation = null;
      if (loggedIn && match.status === 'matched') {
        const [sharingResult, conversationResult] = await Promise.allSettled([
          api.getMatchContactSharing(match.id),
          api.getLatestMatchConversation(match.id)
        ]);
        if (sharingResult.status === 'fulfilled') contactSharing = sharingResult.value;
        else contactSharingError = true;
        if (conversationResult.status === 'fulfilled') matchConversation = conversationResult.value;
      }
      this.setData({ match, isHost, loggedIn, contactSharing, contactSharingError, matchConversation, hasVenueLocation, hasUserLocation: Boolean(userLocation), distanceLabel, markers: hasVenueLocation ? [{ id: 1, latitude: Number(match.venueLatitude), longitude: Number(match.venueLongitude), width: 26, height: 34, title: match.venue }] : [] });
    }).catch((error) => wx.showToast({ title: error.message || '这场约局暂不可用', icon: 'none' }));
  },

  chooseLocation() {
    locationStore.chooseUserLocation((userLocation) => {
      const match = this.data.match;
      const distance = locationStore.distanceKm(userLocation, { latitude: match.venueLatitude, longitude: match.venueLongitude });
      this.setData({ hasUserLocation: Boolean(userLocation), distanceLabel: Number.isFinite(distance) ? `距你 ${locationStore.formatDistance(distance)}` : '' });
    });
  },

  openChat(event) {
    if (!api.isLoggedIn()) { this._pendingGuestAction = { id: this._matchId, focus: event.currentTarget.dataset.focus }; this.selectComponent('#loginGuide').open({ kind: event.currentTarget.dataset.focus === 'confirm' ? 'match' : 'chat' }); return; }
    navigation.openChat(this, event);
  },

  openMatchedChat(event) {
    const conversationId = event.currentTarget.dataset.id;
    if (!conversationId) return;
    wx.navigateTo({ url: `/pages/chat/index?id=${encodeURIComponent(conversationId)}` });
  },

  copyPeerWechatId() {
    const wechatId = this.data.contactSharing && this.data.contactSharing.peerWechatId;
    if (!wechatId) return;
    wx.setClipboardData({ data: wechatId, success: () => wx.showToast({ title: '微信号已复制', icon: 'success' }) });
  },

  goToWechatSettings() { wx.switchTab({ url: '/pages/me/index' }); },

  openHostProfile(event) {
    const userId = event.currentTarget.dataset.userId;
    if (!userId) return;
    if (!api.isLoggedIn()) { this._pendingGuestAction = { userId }; this.selectComponent('#loginGuide').open({ kind: 'profile' }); return; }
    wx.navigateTo({ url: `/pages/user-profile/index?id=${encodeURIComponent(userId)}` });
  },

  onLoginSuccess() {
    const action = this._pendingGuestAction; this._pendingGuestAction = null;
    if (!action) return this.onShow();
    if (action.userId) return wx.navigateTo({ url: `/pages/user-profile/index?id=${encodeURIComponent(action.userId)}` });
    navigation.openChat(this, { currentTarget: { dataset: { id: action.id, focus: action.focus } } });
  },

  openMap() {
    locationStore.openVenueLocation(this.data.match);
  }
});
