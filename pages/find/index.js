const api = require('../../data/api');
const locationStore = require('../../data/location-store');

const ageFilters = [
  { label: '不限年龄', min: 0, max: Infinity },
  { label: '18岁以下', min: 0, max: 17 },
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
    const gameType = this.data.selectedGameType === '全部玩法' ? '' : this.data.selectedGameType;
    const ageFilter = ageFilters[this.data.ageFilterIndex];
    const genderFilter = this.data.genderFilters[this.data.genderFilterIndex];
    api.searchMatches({
      gameType,
      userLocation: this.data.userLocation,
      searchText: this.data.searchText,
      ageMin: ageFilter.min === 0 ? undefined : ageFilter.min,
      ageMax: ageFilter.max === Infinity ? undefined : ageFilter.max,
      gender: genderFilter === '不限性别' ? '' : genderFilter
    }).then((matches) => this.setData({ matches, loadError: '' }))
      .catch((error) => this.setData({ matches: [], loadError: error.message || '暂时无法连接服务' }));
  },

  selectGameType(event) {
    this.setData({ selectedGameType: event.currentTarget.dataset.type }, () => this.refreshMatches());
  },

  openMatch(event) {
    const { id } = event.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
  },

  clearSearch() {
    this.setData({ searchText: '' }, () => this.refreshMatches());
  },

  onSearchInput(event) {
    this.setData({ searchText: event.detail.value }, () => this.refreshMatches());
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

  showDeferredFeature() {
    wx.showToast({ title: '聊天服务尚未接入', icon: 'none' });
  },

  showMessages() {
    wx.showToast({ title: '消息中心尚未接入', icon: 'none' });
  },

  showLocation() {
    locationStore.openLocationActions((userLocation) => {
      this.setData({
        userLocation,
        hasLocation: Boolean(userLocation),
        locationLabel: userLocation ? userLocation.label : '选择位置查看附近球友'
      }, () => this.refreshMatches());
    });
  }
});
