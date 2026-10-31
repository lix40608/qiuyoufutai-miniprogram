const api = require('../../data/api');

Page({
  data: {},
  onShow() {
    if (api.isLoggedIn() && api.hasCurrentLegalAcceptance()) {
      wx.switchTab({ url: '/pages/home/index' });
    } else if (!api.isLoggedIn() && wx.getStorageSync('qiuyou-futai.guest-intro-seen.v1')) {
      wx.switchTab({ url: '/pages/home/index' });
    }
  },
  browse() { wx.setStorageSync('qiuyou-futai.guest-intro-seen.v1', true); wx.switchTab({ url: '/pages/home/index' }); },
  openLogin() { this.selectComponent('#loginGuide').open({ kind: 'first' }); },
  openLegal(event) { wx.navigateTo({ url: `/pages/legal/index?type=${event.currentTarget.dataset.type}` }); },
  onLoginSuccess() { wx.switchTab({ url: '/pages/home/index' }); }
});
