const api = require('../../data/api');
const conversationList = require('../../data/conversation-list');

Page({
  data: { match: null, conversations: [], page: 1, hasMore: true, loading: true, loadingMore: false, loadError: '' },
  onLoad(query) {
    this.matchId = query.matchId;
    if (!this.matchId) return this.setData({ loading: false, loadError: '缺少约局信息' });
    this.loadPage(1, false);
  },
  onShow() { if (this.matchId && this._loaded) this.loadPage(1, false); },
  onPullDownRefresh() { if (this.matchId) this.loadPage(1, false).finally(() => wx.stopPullDownRefresh()); },
  onReachBottom() {
    if (!this.data.loading && !this.data.loadingMore && this.data.hasMore) this.loadPage(this.data.page + 1, true);
  },
  async loadPage(page, append) {
    if (this._loading) return;
    this._loading = true;
    const requestId = this._requestId = (this._requestId || 0) + 1;
    this.setData(append ? { loadingMore: true } : { loading: true, loadingMore: false, loadError: '' });
    try {
      const [match, rows] = await Promise.all([api.getMatch(this.matchId), api.getMatchConversations(this.matchId, page, 10)]);
      if (requestId !== this._requestId) return;
      const conversations = conversationList.groupConversations(rows).reduce((all, group) => all.concat(group.conversations), []);
      this.setData({ match, conversations: append ? this.data.conversations.concat(conversations) : conversations,
        page, hasMore: rows.length === 10, loading: false, loadingMore: false, loadError: '' });
      this._loaded = true;
      wx.setNavigationBarTitle({ title: '球友聊天' });
    } catch (error) {
      if (requestId === this._requestId) this.setData({ loading: false, loadingMore: false, loadError: error.message || '暂时无法加载聊天列表' });
    } finally { this._loading = false; }
  },
  openConversation(event) { wx.navigateTo({ url: `/pages/chat/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }); },
  retry() { this.loadPage(1, false); }
});
