const api = require('../../data/api');
const unread = require('../../data/unread');

const emptyPersonal = { avatarPath: '', nickname: '', age: '', gender: '' };
const emptyArchive = { intro: '', gameTypes: [] };

Page({
  data: {
    personal: emptyPersonal,
    archive: emptyArchive
  },

  onShow() {
    unread.start(this);
    this.refreshPage();
  },

  onHide() { unread.stop(this); },
  onUnload() { unread.stop(this); },

  refreshPage() {
    api.getProfile().then((profile) => {
      const personal = Object.assign({}, emptyPersonal, profile);
      const personalComplete = Boolean(personal.nickname && personal.age && personal.gender);
      const personalMeta = [personal.age ? `${personal.age} 岁` : '', personal.gender || ''].filter(Boolean).join(' · ');
      this.setData({
        personal,
        personalComplete,
        personalMeta,
        archive: Object.assign({}, emptyArchive, profile),
        archiveConfigured: Boolean(profile.intro || (profile.gameTypes || []).length)
      });
    }).catch((error) => wx.showToast({ title: error.message || '读取资料失败', icon: 'none' }));
  },

  editPersonalProfile() {
    wx.navigateTo({ url: '/pages/personal-profile/index?section=personal' });
  },

  editContactProfile() { wx.navigateTo({ url: '/pages/personal-profile/index?section=personal' }); },

  showMessages() { wx.navigateTo({ url: '/pages/messages/index' }); },

  openLegal(event) {
    wx.navigateTo({ url: `/pages/legal/index?type=${event.currentTarget.dataset.type}` });
  },

  showDeferredFeature(event) {
    wx.showToast({ title: event.currentTarget.dataset.message, icon: 'none' });
  }
});
