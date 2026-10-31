const api = require('../../data/api');

const copy = {
  first: ['登录并加入球友赴台', '首次登录会为你创建账号，之后即可发布约球、联系球友和查看组局进度。'],
  chat: ['登录后即可联系球友', '登录后继续这场约球的聊天，及时查看回复和组局进度。'],
  match: ['登录后确认组局', '登录后可确认这场约球并继续沟通。'],
  profile: ['登录后查看球友资料', '登录后查看完整球友资料，继续了解这位球友。'],
  group: ['登录后管理我的约球', '登录后发布约球，并管理我发起的球局和聊过的记录。'],
  me: ['登录球友赴台', '登录后查看个人资料、消息通知和约球记录。'],
  publish: ['登录后发起约球', '登录后即可发布约球并管理报名和聊天。'],
  messages: ['登录后查看消息', '登录后查看聊天消息和约球状态通知。']
};

Component({
  data: { visible: false, accepted: false, submitting: false, title: copy.chat[0], description: copy.chat[1], error: '' },
  methods: {
    open(options = {}) {
      const kind = options.kind || 'chat';
      const text = copy[kind] || copy.chat;
      this.setData({ visible: true, accepted: false, submitting: false, error: '', title: text[0], description: text[1] });
      if (api.shouldShowLegalUpdateReminder()) {
        wx.showToast({ title: '用户协议和隐私政策已更新', icon: 'none', duration: 2500 });
      }
    },
    close() { if (!this.data.submitting) this.setData({ visible: false, error: '' }); },
    stopTap() {},
    toggleConsent() { this.setData({ accepted: !this.data.accepted, error: '' }); },
    openLegal(event) {
      const type = event.currentTarget.dataset.type;
      wx.navigateTo({ url: `/pages/legal/index?type=${type}` });
    },
    async login() {
      if (this.data.submitting) return;
      this.setData({ submitting: true, error: '' });
      try {
        await api.login(this.data.accepted);
        this.setData({ visible: false, submitting: false });
        this.triggerEvent('success');
      } catch (error) {
        const message = error.code === 'LEGAL_CONSENT_REQUIRED'
          ? '首次创建账号前，请阅读并勾选同意《用户协议》和《隐私政策》。'
          : (error.message || '登录暂时不可用，请稍后重试。');
        this.setData({ submitting: false, error: message });
      }
    }
  }
});
