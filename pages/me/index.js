const api = require('../../data/api');
const unread = require('../../data/unread');

const emptyPersonal = { avatarPath: '', nickname: '', age: '', gender: '' };
const emptyArchive = { intro: '', gameTypes: [] };

Page({
  data: {
    personal: emptyPersonal,
    archive: emptyArchive,
    wechatId: '',
    wechatDraft: '',
    wechatEditorVisible: false,
    savingWechat: false
  },

  onShow() {
    unread.start(this);
    this.refreshPage();
  },

  onHide() { unread.stop(this); },
  onUnload() { unread.stop(this); },

  refreshPage() {
    Promise.all([api.getProfile(), api.getMyWechatContact()]).then(([profile, contact]) => {
      const personal = Object.assign({}, emptyPersonal, profile);
      const personalComplete = Boolean(personal.nickname && personal.age && personal.gender);
      const personalMeta = [personal.age ? `${personal.age} 岁` : '', personal.gender || ''].filter(Boolean).join(' · ');
      this.setData({
        personal,
        personalComplete,
        personalMeta,
        archive: Object.assign({}, emptyArchive, profile),
        archiveConfigured: Boolean(profile.intro || (profile.gameTypes || []).length),
        wechatId: contact.wechatId || ''
      });
    }).catch((error) => wx.showToast({ title: error.message || '读取资料失败', icon: 'none' }));
  },

  editPersonalProfile() {
    wx.navigateTo({ url: '/pages/personal-profile/index?section=personal' });
  },

  openWechatEditor() { this.setData({ wechatDraft: this.data.wechatId || '', wechatEditorVisible: true }); },

  closeWechatEditor() { if (!this.data.savingWechat) this.setData({ wechatEditorVisible: false }); },

  stopModalTap() {},

  onWechatInput(event) { this.setData({ wechatDraft: event.detail.value }); },

  saveWechatId() {
    if (this.data.savingWechat) return;
    const wechatId = (this.data.wechatDraft || '').trim();
    if (wechatId && !/^[A-Za-z][A-Za-z0-9_-]{5,19}$/.test(wechatId)) {
      wx.showToast({ title: '微信号需为6至20位，以字母开头', icon: 'none' });
      return;
    }
    this.setData({ savingWechat: true });
    api.saveMyWechatContact(wechatId).then((result) => {
      this.setData({ wechatId: result.wechatId || '', wechatDraft: result.wechatId || '', wechatEditorVisible: false });
      wx.showToast({ title: '微信号已保存', icon: 'success' });
    }).catch((error) => wx.showToast({ title: error.message || '保存失败，请重试', icon: 'none' }))
      .finally(() => this.setData({ savingWechat: false }));
  },

  openAboutUs() { wx.navigateTo({ url: '/pages/about/index' }); },

  showMessages() { wx.navigateTo({ url: '/pages/messages/index' }); },

  openLegal(event) {
    wx.navigateTo({ url: `/pages/legal/index?type=${event.currentTarget.dataset.type}` });
  },

  confirmLogout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后需要重新登录才能继续管理账号和约球。',
      cancelText: '暂不退出',
      confirmText: '退出登录',
      success: (result) => {
        if (!result.confirm) return;
        api.logout().then(() => {
          wx.removeStorageSync('qiuyou-futai.session-token.v1');
          wx.removeStorageSync('qiuyou-futai.legal-acceptance.v1');
          wx.reLaunch({ url: '/pages/legal-consent/index' });
        }).catch((error) => wx.showToast({ title: error.message || '退出失败，请重试', icon: 'none' }));
      }
    });
  },

  confirmDeleteAccount() {
    wx.showModal({
      title: '确认注销账号？',
      content: '注销后将清除个人资料、微信号和登录标识，取消未开始的球局；历史聊天记录会匿名化保留。此操作无法撤销。',
      cancelText: '再想一想',
      confirmText: '确认注销',
      confirmColor: '#c64f49',
      success: (result) => {
        if (!result.confirm) return;
        api.deleteAccount().then(() => {
          wx.removeStorageSync('qiuyou-futai.session-token.v1');
          wx.removeStorageSync('qiuyou-futai.legal-acceptance.v1');
          wx.reLaunch({ url: '/pages/legal-consent/index' });
        }).catch((error) => wx.showToast({ title: error.message || '注销失败，请重试', icon: 'none' }));
      }
    });
  },

  showDeferredFeature(event) {
    wx.showToast({ title: event.currentTarget.dataset.message, icon: 'none' });
  }
});
