const api = require('../../data/api');

Page({
  data: { agreementChecked: false, submitting: false, error: '' },

  onLoad() {
    if (api.hasCurrentLegalAcceptance()) this.enterApp();
  },

  toggleAgreement() { this.setData({ agreementChecked: !this.data.agreementChecked, error: '' }); },

  readDocument(event) {
    const type = event.currentTarget.dataset.type;
    wx.navigateTo({ url: `/pages/legal/index?type=${type}` });
  },

  async agreeAndCreateAccount() {
    if (this.data.submitting) return;
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
