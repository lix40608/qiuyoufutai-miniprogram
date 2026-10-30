const navigation = require('../../data/navigation');
const api = require('../../data/api');
const unread = require('../../data/unread');
const locationStore = require('../../data/location-store');

const ageFilters = [
  { label: '不限年龄', min: 0, max: Infinity },
  { label: '18–25岁', min: 18, max: 25 },
  { label: '26–35岁', min: 26, max: 35 },
  { label: '36–45岁', min: 36, max: 45 },
  { label: '46岁以上', min: 46, max: Infinity }
];

Page({
  data: {
    gameTypes: ['全部玩法', '中式八球', '中式九球', '斯诺克'],
    selectedGameType: '全部玩法',
    matches: [],
    page: 1,
    hasMore: true,
    loading: false,
    loadingMore: false,
    currentUserId: null,
    hasLocation: false,
    userLocation: null,
    locationLabel: '选择位置查看附近球友',
    searchText: '',
    ageFilterLabels: ageFilters.map((filter) => filter.label),
    ageFilterIndex: 0,
    genderFilters: ['不限性别', '男', '女'],
    genderFilterIndex: 0,
    loadError: ''
  },

  onShow() {
    unread.start(this);
    api.getProfile().then(profile => this.setData({ currentUserId: profile.userId })).catch(() => this.setData({ currentUserId: null }));
    const app = getApp();
    if (app.globalData.pendingGameType) {
      this.setData({ selectedGameType: app.globalData.pendingGameType });
      app.globalData.pendingGameType = '';
    }
    const userLocation = locationStore.getUserLocation();
    this.setData({
      userLocation,
      hasLocation: Boolean(userLocation),
      locationLabel: userLocation ? userLocation.label : '选择位置查看附近球友'
    }, () => this.refreshMatches());
  },

  refreshMatches() {
    return this.loadMatches(1, false);
  },

  loadMatches(page, append) {
    const requestId = this._requestId = (this._requestId || 0) + 1;
    const gameType = this.data.selectedGameType === '全部玩法' ? '' : this.data.selectedGameType;
    const ageFilter = ageFilters[this.data.ageFilterIndex];
    const genderFilter = this.data.genderFilters[this.data.genderFilterIndex];
    const request = api.searchMatches({
      gameType,
      userLocation: this.data.userLocation,
      searchText: this.data.searchText,
      ageMin: ageFilter.min === 0 ? undefined : ageFilter.min,
      ageMax: ageFilter.max === Infinity ? undefined : ageFilter.max,
      gender: genderFilter === '不限性别' ? '' : genderFilter,
      page,
      pageSize: 10
    });
    this.setData(append ? { loadingMore: true } : { loading: true, loadingMore: false, page: 1, hasMore: true, matches: [], loadError: '' });
    return request.then((rows) => {
      if (requestId !== this._requestId) return;
      if (append && !rows.length) return this.setData({ loadingMore: false, hasMore: false });
      const matches = (append ? this.data.matches.concat(rows) : rows).map(row => Object.assign({}, row, { chatUnreadCount: (this.data.unreadByMatchId || {})[String(row.id)] || 0 }));
      this.setData({ matches, page, hasMore: rows.length === 10, loading: false, loadingMore: false, loadError: '' });
    }).catch((error) => {
      if (requestId === this._requestId) this.setData(append
        ? { loadingMore: false }
        : { matches: [], loading: false, loadError: error.message || '暂时无法连接服务' });
    });
  },

  onReachBottom() {
    if (!this.data.loading && !this.data.loadingMore && this.data.hasMore) this.loadMatches(this.data.page + 1, true);
  },

  onHide() { unread.stop(this); clearTimeout(this._searchTimer); },
  onUnload() { unread.stop(this); clearTimeout(this._searchTimer); this._requestId = (this._requestId || 0) + 1; },

  selectGameType(event) {
    this.setData({ selectedGameType: event.currentTarget.dataset.type }, () => this.refreshMatches());
  },

  openMatch(event) {
    const { id } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
  },

  openVenue(event) { locationStore.openVenueLocation(event.currentTarget.dataset.match); },

  clearSearch() {
    this.setData({ searchText: '' }, () => this.refreshMatches());
  },

  onSearchInput(event) {
    this.setData({ searchText: event.detail.value });
    clearTimeout(this._searchTimer);
    this._requestId = (this._requestId || 0) + 1;
    this._searchTimer = setTimeout(() => this.refreshMatches(), 250);
  },

  selectAgeFilter(event) {
    this.setData({ ageFilterIndex: Number(event.detail.value) }, () => this.refreshMatches());
  },

  selectGenderFilter(event) {
    this.setData({ genderFilterIndex: Number(event.detail.value) }, () => this.refreshMatches());
  },

  openHostProfile(event) {
    const userId = event.currentTarget.dataset.userId;
    if (!userId) return;
    wx.navigateTo({ url: `/pages/user-profile/index?id=${encodeURIComponent(userId)}` });
  },

  showDeferredFeature(event) { navigation.openChat(this, event); },

  showMessages() { navigation.openMessages(); },

  clearLocation() {
    locationStore.clearUserLocation();
    this.setData({ userLocation: null, hasLocation: false, locationLabel: '选择位置查看附近球友' }, () => this.refreshMatches());
  },

  showLocation() {
    locationStore.chooseUserLocation((userLocation) => {
      this.setData({
        userLocation,
        hasLocation: Boolean(userLocation),
        locationLabel: userLocation ? userLocation.label : '选择位置查看附近球友'
      }, () => this.refreshMatches());
    });
  }
});
