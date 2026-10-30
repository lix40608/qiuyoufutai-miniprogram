const api = require('../../data/api');

Page({
  data: { agreementChecked: false, adultChecked: false, readTerms: false, readPrivacy: false, submitting: false, error: '' },

  onLoad() {
    if (api.hasCurrentLegalAcceptance()) this.enterApp();
  },

  toggleAgreement() {
    if (!this.data.readTerms || !this.data.readPrivacy) {
      wx.showToast({ title: '请先分别阅读完用户协议和隐私政策', icon: 'none' });
      return;
    }
    this.setData({ agreementChecked: !this.data.agreementChecked, error: '' });
  },
  toggleAdult() { this.setData({ adultChecked: !this.data.adultChecked, error: '' }); },

  readDocument(event) {
    const type = event.currentTarget.dataset.type;
    wx.navigateTo({
      url: `/pages/legal/index?type=${type}`,
      success: (result) => result.eventChannel.on('legalDocumentRead', () => {
        this.setData(type === 'privacy' ? { readPrivacy: true, agreementChecked: false } : { readTerms: true, agreementChecked: false });
      })
    });
  },

  async agreeAndCreateAccount() {
    if (this.data.submitting) return;
    if (!this.data.adultChecked) {
      this.setData({ error: '本小程序仅限年满18周岁的用户使用。' });
      return;
    }
    if (!this.data.agreementChecked) {
      this.setData({ error: '请先阅读并同意《用户协议》和《隐私政策》。' });
      return;
    }
    this.setData({ submitting: true, error: '' });
    try {
      await api.acceptLegalTerms();
      this.enterApp();
    } catch (error) {
      this.setData({ error: error.message || '暂时无法创建账号，请稍后重试。' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  enterApp() {
    wx.switchTab({ url: '/pages/home/index' });
  },

  exitMiniProgram() { wx.exitMiniProgram({}); }
});
