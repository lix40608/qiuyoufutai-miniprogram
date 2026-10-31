const api = require('../../data/api');

Component({
  data: { visible: false, matchId: '', reason: '', submitting: false },
  methods: {
    noop() {},
    open(matchId) {
      this.setData({ visible: true, matchId: String(matchId), reason: '', submitting: false });
    },
    close() {
      if (this.data.submitting) return;
      this.setData({ visible: false, reason: '' });
    },
    onReasonInput(event) { this.setData({ reason: event.detail.value }); },
    submit() {
      const reason = String(this.data.reason || '').trim();
      if (!reason) return wx.showToast({ title: '请填写取消原因', icon: 'none' });
      if (reason.length > 300) return wx.showToast({ title: '取消原因最多 300 字', icon: 'none' });
      if (this.data.submitting || !this.data.matchId) return;
      this.setData({ submitting: true });
      api.cancelMatch(this.data.matchId, reason).then(() => {
        const matchId = this.data.matchId;
        this.setData({ visible: false, reason: '', submitting: false });
        this.triggerEvent('success', { matchId });
      }).catch(error => {
        this.setData({ submitting: false });
        wx.showModal({ title: '取消失败', content: error.message || '服务暂时不可用，请重试。', showCancel: false });
      });
    }
  }
});
