const api = require('../../data/api');
const locationStore = require('../../data/location-store');

Page({
  data: { activeView: 'created', loading: true, loadError: '', latestActive: null, latestDraft: null, chatted: [] },

  onShow() { this.refresh(); },
  onUnload() { this._requestId = (this._requestId || 0) + 1; },

  refresh() {
    const requestId = this._requestId = (this._requestId || 0) + 1;
    const view = this.data.activeView;
    const userLocation = locationStore.getUserLocation();
    this.setData({ hasUserLocation: Boolean(userLocation) });
    this.setData({ loading: true, loadError: '' });
    const request = view === 'created' ? api.getMyMatches() : api.getChattedMatches();
    request.then((records) => {
      if (requestId !== this._requestId) return;
      // 接口暂无发布时间，按更新时间倒序；草稿同样按最近编辑时间排序。
      const recent = records.map(item => {
        const distance = locationStore.distanceKm(userLocation, { latitude: item.venueLatitude, longitude: item.venueLongitude });
        return Object.assign({}, item, { distanceLabel: Number.isFinite(distance) ? `距你 ${locationStore.formatDistance(distance)}` : '' });
      }).sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0) || Number(b.id) - Number(a.id));
      if (view === 'created') {
        this.setData({ latestActive: recent.find(item => item.status !== 'draft' && item.status !== 'cancelled' && !item.displayEnded) || null, latestDraft: recent.find(item => item.status === 'draft') || null, loading: false });
      } else {
        this.setData({ chatted: recent, loading: false });
      }
    }).catch(error => { if (requestId === this._requestId) this.setData({ loading: false, loadError: error.message || '暂时无法加载约球' }); });
  },

  selectView(event) { this.setData({ activeView: event.currentTarget.dataset.view }, () => this.refresh()); },
  chooseLocation() { locationStore.chooseUserLocation(() => this.refresh()); },
  openVenue(event) { locationStore.openVenueLocation(event.currentTarget.dataset.match); },
  publish() { wx.navigateTo({ url: '/pages/publish/index' }); },
  allMatches() { wx.navigateTo({ url: '/pages/my-matches/index' }); },
  openRecord(event) {
    const { id, status, conversationId } = event.currentTarget.dataset;
    if (conversationId) return wx.navigateTo({ url: `/pages/chat/index?id=${encodeURIComponent(conversationId)}` });
    if (status === 'draft') return wx.navigateTo({ url: `/pages/publish/index?draftId=${encodeURIComponent(id)}` });
    wx.navigateTo({ url: `/pages/detail/index?id=${encodeURIComponent(id)}` });
  },
  cancelRecord(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({ title: '取消这场约局？', content: '取消后将停止招募，聊天不能继续发送或确认。', confirmText: '确认取消', cancelText: '继续招募', success: (result) => {
      if (!result.confirm) return;
      api.cancelMatch(id).then(() => { this.refresh(); wx.showToast({ title: '已取消', icon: 'success' }); }).catch(error => wx.showModal({ title: '取消失败', content: error.message || '服务暂时不可用，请重试。', showCancel: false }));
    } });
  }
});
