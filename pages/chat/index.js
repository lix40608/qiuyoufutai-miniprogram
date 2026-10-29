const api = require('../../data/api');
const model = require('../../data/chat-model');

Page({
  data: { match: null, conversation: null, messages: [], draft: '', loading: true, newMessageCount: 0,
    sending: false, confirming: false, loadError: '', syncError: '', keyboardHeight: 0,
    closed: false, canConfirm: false, showInvite: false, inviteDismissed: false, count: 0, hint: '', statusLabel: '', scrollTarget: '', focusConfirm: false, showConfirmedTip: false,
    currentName: '我', currentAvatar: '', peerName: '球友', peerAvatar: '', systemNotice: '' },

  onLoad(query) {
    this._afterId = 0;
    this._nearBottom = true;
    this._messageViewportHeight = 0;
    this.setData({ focusConfirm: query.focus === 'confirm' });
    this.initialize(query);
  },
  onShow() { this._active = true; if (this._ready) this.sync(); },
  onHide() { this._active = false; clearTimeout(this._timer); },
  onUnload() { this._active = false; this._destroyed = true; clearTimeout(this._timer); clearTimeout(this._confirmedTipTimer); },

  async initialize(query) {
    try {
      const profile = await api.getProfile();
      this._userId = profile.userId;
      const conversation = query.id ? await api.getConversation(query.id, true) : await api.openConversation(query.matchId);
      const match = await api.getMatch(conversation.matchId);
      if (this._destroyed) return;
      this._ready = true;
      wx.setNavigationBarTitle({ title: conversation.peerName || '约局聊天' });
      this.setData(Object.assign({ match, conversation, loadError: '', currentName: profile.nickname || '我', currentAvatar: profile.avatarUrl || '',
        peerName: conversation.peerName || '球友', peerAvatar: conversation.peerAvatar || '' }, model.conversationState(conversation, this._userId, match)));
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
      const justConfirmed = Boolean(conversation.won && !this.data.conversation.won);
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
      if (!this._destroyed) {
        const nextState = model.conversationState(conversation, this._userId, this.data.match);
        const newlyReceivedInvite = !this.data.showInvite && nextState.showInvite;
        this.setData(Object.assign({ conversation, loading: false, syncError: '' }, nextState));
        if (newlyReceivedInvite) api.markConversationRead(conversation.id).catch(() => {});
        if (justConfirmed) this.showConfirmedTip();
      }
    } catch (error) {
      if (!this._destroyed) this.setData({ loading: false, syncError: error.message || '连接中断，正在重试' });
    } finally {
      this._syncing = false;
      if (this._active && !this._destroyed) this._timer = setTimeout(() => this.sync(), catchingUp ? 100 : 3000);
    }
  },
  renderMessages(messages) {
    const previousIds = new Set((this.data.messages || []).filter(item => item.id != null).map(item => String(item.id)));
    const rows = messages.map(item => Object.assign({}, item, {
      key: item.id ? `message-${item.id}` : item.clientId,
      mine: Number(item.senderId) === Number(this._userId),
      timeLabel: new Date(item.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }));
    const addedMessages = rows.filter(item => item.id != null && !previousIds.has(String(item.id)));
    const addedIncoming = addedMessages.filter(item => !item.mine).length;
    const addedMine = addedMessages.some(item => item.mine);
    const followLatest = !this._hasRenderedMessages || this._nearBottom || addedMine;
    const newMessageCount = addedIncoming && !followLatest
      ? (Number(this.data.newMessageCount) || 0) + addedIncoming
      : followLatest ? 0 : (Number(this.data.newMessageCount) || 0);
    const update = { messages: rows, newMessageCount };
    if (followLatest && rows.length) update.scrollTarget = rows[rows.length - 1].key;
    this._hasRenderedMessages = true;
    this.setData(update);
  },
  onMessageScroll(event) {
    const detail = event.detail || {};
    this._lastMessageScroll = detail;
    if (this._messageViewportHeight > 0) return this.updateMessageScrollState(detail);
    if (this._measuringMessageViewport) return;
    this._measuringMessageViewport = true;
    wx.createSelectorQuery().in(this).select('.message-list').boundingClientRect(rect => {
      this._messageViewportHeight = rect ? rect.height : 0;
      this._measuringMessageViewport = false;
      if (this._lastMessageScroll) this.updateMessageScrollState(this._lastMessageScroll);
    }).exec();
  },
  updateMessageScrollState(detail) {
    const scrollTop = Number(detail.scrollTop) || 0;
    const scrollHeight = Number(detail.scrollHeight) || 0;
    this._nearBottom = scrollHeight <= this._messageViewportHeight + 48
      || scrollHeight - scrollTop - this._messageViewportHeight <= 60;
    if (this._nearBottom && this.data.newMessageCount) this.setData({ newMessageCount: 0 });
  },
  jumpToLatest() {
    const latest = (this.data.messages || []).slice(-1)[0];
    if (!latest) return;
    this._nearBottom = true;
    this.setData({ scrollTarget: latest.key, newMessageCount: 0 });
  },
  showConfirmedTip() {
    clearTimeout(this._confirmedTipTimer);
    this.setData({ showConfirmedTip: true });
    this._confirmedTipTimer = setTimeout(() => {
      if (!this._destroyed) this.setData({ showConfirmedTip: false });
    }, 2800);
  },
  onDraftInput(event) { this.setData({ draft: event.detail.value }); },
  onKeyboardHeightChange(event) {
    this.setData({ keyboardHeight: event.detail.height || 0 }, () => {
      wx.createSelectorQuery().in(this).select('.message-list').boundingClientRect(rect => {
        this._messageViewportHeight = rect ? rect.height : 0;
      }).exec();
    });
  },
  async sendMessage() {
    const content = this.data.draft.trim();
    if (!content || this.data.loading || this.data.sending || this.data.closed || !this._ready) return;
    if (content.length > 1000) return wx.showToast({ title: '消息最多 1000 字', icon: 'none' });
    const clientId = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.setData({ sending: true, draft: '' });
    try {
      const message = await api.sendMessage(this.data.conversation.id, content, clientId);
      if (!this._destroyed) this.renderMessages(model.mergeMessages(this.data.messages, [message]));
    } catch (error) {
      if (!this._destroyed) {
        const failed = { clientId, senderId: this._userId, content, state: 'failed', createdAt: new Date().toISOString(),
          failureLabel: error.statusCode ? '未发送' : '发送结果待确认',
          failureReason: error.statusCode ? error.message : '发送结果暂未确认，请等待消息同步后再决定是否重发。' };
        this.renderMessages(model.mergeMessages(this.data.messages, [failed]));
        await this.lockClosedConversation(error, '刚才这条消息未投递');
      }
    } finally { if (!this._destroyed) this.setData({ sending: false }); }
  },
  async lockClosedConversation(error, actionLabel) {
    if (!['MATCH_CANCELLED', 'CONVERSATION_CLOSED', 'MATCH_ALREADY_WON', 'MATCH_DISPLAY_ENDED'].includes(error.code)) return false;
    const cancelled = error.code === 'MATCH_CANCELLED';
    const reason = cancelled ? '约局已取消' : error.code === 'MATCH_DISPLAY_ENDED' ? '本场公开展示期限已结束' : '本场已由其他聊天完成组局';
    const notice = `${reason}。${actionLabel}；本聊天的确认和发送已关闭，你仍可查看历史记录。`;
    this.setData({ closed: true, canConfirm: false, showInvite: false, hint: notice, systemNotice: notice, scrollTarget: 'closure-notice' });
    try {
      const conversation = await api.getConversation(this.data.conversation.id);
      if (!this._destroyed) this.setData(Object.assign({ conversation }, model.conversationState(conversation, this._userId, this.data.match), {
        closed: true, canConfirm: false, showInvite: false, hint: notice, systemNotice: notice, scrollTarget: 'closure-notice'
      }));
    } catch (_) { /* Keep the authoritative action rejection visible and keep actions locked. */ }
    return true;
  },
  showFailure(event) {
    const item = this.data.messages.find(row => row.key === event.currentTarget.dataset.key);
    if (!item) return;
    if (this.data.closed) return wx.showModal({ title: '消息未发送', content: item.failureReason, showCancel: false, confirmText: '知道了' });
    wx.showModal({ title: '消息未确认发送', content: item.failureReason, confirmText: '修改消息',
      success: result => {
        if (!result.confirm || this._destroyed) return;
        this.setData({ draft: item.content });
        this.renderMessages(this.data.messages.filter(row => row.key !== item.key));
      } });
  },
  dismissInvite() { this.setData({ inviteDismissed: true }); },
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
        this.setData(Object.assign({ conversation }, model.conversationState(conversation, this._userId, this.data.match)));
        if (conversation.won) this.showConfirmedTip();
        else wx.showToast({ title: '已确认，等待对方', icon: 'none' });
      }
    } catch (error) {
      if (!this._destroyed && !await this.lockClosedConversation(error, '本次确认未提交')) wx.showToast({ title: error.message || '确认失败，请重试', icon: 'none' });
    }
    finally { if (!this._destroyed) this.setData({ confirming: false }); this.sync(); }
  },
  openDetail() { if (this.data.match) wx.navigateTo({ url: `/pages/detail/index?id=${encodeURIComponent(this.data.match.id)}` }); }
});
