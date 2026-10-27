const api = require('../../data/api');

const emptyPersonal = { avatarPath: '', nickname: '', age: '', gender: '' };
const emptyArchive = { intro: '', gameTypes: [] };

Page({
  data: {
    personal: emptyPersonal,
    archive: emptyArchive,
    localMatchCount: 0
  },

  onShow() {
    this.refreshPage();
  },

  refreshPage() {
    Promise.all([api.getProfile(), api.getMyMatches()]).then(([profile, matches]) => {
      const personal = Object.assign({}, emptyPersonal, profile);
      const personalComplete = Boolean(personal.nickname && personal.age && personal.gender);
      const personalMeta = [personal.age ? `${personal.age} 岁` : '', personal.gender || ''].filter(Boolean).join(' · ');
      this.setData({
        personal,
        personalComplete,
        personalMeta,
        archive: Object.assign({}, emptyArchive, profile),
        archiveConfigured: Boolean(profile.intro || (profile.gameTypes || []).length),
        localMatchCount: matches.length
      });
    }).catch((error) => wx.showToast({ title: error.message || '读取资料失败', icon: 'none' }));
  },

  editPersonalProfile() {
    wx.navigateTo({ url: '/pages/personal-profile/index?section=personal' });
  },

  goMyMatches() {
    wx.navigateTo({ url: '/pages/my-matches/index' });
  },

  showDeferredFeature(event) {
    wx.showToast({ title: event.currentTarget.dataset.message, icon: 'none' });
  }
});
