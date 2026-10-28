const api = require('../../data/api');
const model = require('../../data/chat-model');

Page({
  data: { match: null, conversation: null, messages: [], draft: '', loading: true,
    sending: false, confirming: false, loadError: '', syncError: '', keyboardHeight: 0,
    closed: false, canConfirm: false, count: 0, hint: '', statusLabel: '', scrollTarget: '', focusConfirm: false },

  onLoad(query) {
    this._afterId = 0;
    this.setData({ focusConfirm: query.focus === 'confirm' });
    this.initialize(query);
  },
  onShow() { this._active = true; if (this._ready) this.sync(); },
  onHide() { this._active = false; clearTimeout(this._timer); },
  onUnload() { this._active = false; this._destroyed = true; clearTimeout(this._timer); },

  async initialize(query) {
    try {
      const profile = await api.getProfile();
      this._userId = profile.userId;
      const conversation = query.id ? await api.getConversation(query.id) : await api.openConversation(query.matchId);
      const match = await api.getMatch(conversation.matchId);
      if (this._destroyed) return;
      this._ready = true;
      wx.setNavigationBarTitle({ title: conversation.peerName || '约局聊天' });
      this.setData(Object.assign({ match, conversation, loadError: '' }, model.conversationState(conversation, this._userId)));
      if (this._active) this.sync();
    } catch (error) {
      if (!this._destroyed) this.setData({ loading: false, loadError: error.message || '暂时无法打开聊天' });
    }
  },

  async sync() {
    if (!this._active || !this._ready || this._syncing) return;
    clearTimeout(this._timer);
    this._syncing = true;
    let catchingUp = false;
    try {
      const conversation = await api.getConversation(this.data.conversation.id);
      // Page through history without skipping incoming messages or overlapping requests.
      for (let page = 0; page < 10 && this._active; page++) {
        const rows = await api.getMessages(conversation.id, this._afterId);
        if (this._destroyed) return;
        if (rows.length) {
          this._afterId = Number(rows[rows.length - 1].id);
          this.renderMessages(model.mergeMessages(this.data.messages, rows));
        }
        catchingUp = rows.length === 100;
        if (!catchingUp) break;
      }
      if (!this._destroyed) this.setData(Object.assign({ conversation, loading: false, syncError: '' }, model.conversationState(conversation, this._userId)));
    } catch (error) {
      if (!this._destroyed) this.setData({ loading: false, syncError: error.message || '连接中断，正在重试' });
    } finally {
      this._syncing = false;
      if (this._active && !this._destroyed) this._timer = setTimeout(() => this.sync(), catchingUp ? 100 : 3000);
    }
  },
  renderMessages(messages) {
    const previousCount = this.data.messages.length;
    const rows = messages.map(item => Object.assign({}, item, {
      key: item.id ? `message-${item.id}` : item.clientId,
      mine: Number(item.senderId) === Number(this._userId),
      timeLabel: new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }));
    this.setData({ messages: rows });
    if (rows.length !== previousCount && rows.length) this.setData({ scrollTarget: rows[rows.length - 1].key });
  },
  onDraftInput(event) { this.setData({ draft: event.detail.value }); },
  onKeyboardHeightChange(event) { this.setData({ keyboardHeight: event.detail.height || 0 }); },
  async sendMessage() {
    const content = this.data.draft.trim();
    if (!content || this.data.loading || this.data.sending || this.data.closed || !this._ready) return;
    if (content.length > 1000) return wx.showToast({ title: '消息最多 1000 字', icon: 'none' });
    this.setData({ sending: true, draft: '' });
    try {
      const message = await api.sendMessage(this.data.conversation.id, content);
      if (!this._destroyed) this.renderMessages(model.mergeMessages(this.data.messages, [message]));
    } catch (error) {
      if (!this._destroyed) {
        const failed = { clientId: `failed-${Date.now()}`, senderId: this._userId, content, state: 'failed', createdAt: new Date().toISOString(),
          failureLabel: error.statusCode ? '未发送' : '发送结果待确认',
          failureReason: error.statusCode ? error.message : '发送结果暂未确认，请等待消息同步后再决定是否重发。' };
        this.renderMessages(model.mergeMessages(this.data.messages, [failed]));
      }
    } finally { if (!this._destroyed) this.setData({ sending: false }); }
  },
  showFailure(event) {
    const item = this.data.messages.find(row => row.key === event.currentTarget.dataset.key);
    if (!item) return;
    wx.showModal({ title: '消息未确认发送', content: item.failureReason, confirmText: '修改消息',
      success: result => {
        if (!result.confirm || this._destroyed) return;
        this.setData({ draft: item.content });
        this.renderMessages(this.data.messages.filter(row => row.key !== item.key));
      } });
  },
  confirmMatch() {
    if (!this.data.canConfirm || this.data.confirming) return;
    wx.showModal({ title: '确认这场约球？', content: '确认表示你愿意按约定赴约，双方确认后即组局成功。', confirmText: '确认组局',
      success: result => { if (result.confirm) this.submitConfirmation(); } });
  },
  async submitConfirmation() {
    if (!this.data.canConfirm || this.data.confirming || this._destroyed) return;
    this.setData({ confirming: true });
    try {
      const conversation = await api.confirmConversation(this.data.conversation.id);
      if (!this._destroyed) {
        this.setData(Object.assign({ conversation }, model.conversationState(conversation, this._userId)));
        wx.showToast({ title: conversation.won ? '双方已确认组局' : '已确认，等待对方', icon: 'none' });
      }
    } catch (error) { if (!this._destroyed) wx.showToast({ title: error.message || '确认失败，请重试', icon: 'none' }); }
    finally { if (!this._destroyed) this.setData({ confirming: false }); this.sync(); }
  },
  openDetail() { if (this.data.match) wx.navigateTo({ url: `/pages/detail/index?id=${this.data.match.id}` }); }
});
