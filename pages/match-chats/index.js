const api = require('../../data/api');
const realtime = require('../../data/realtime');
const conversationList = require('../../data/conversation-list');

Page({
  data: { conversations: [], conversationGroups: [], page: 1, hasMore: true, loading: true, loadingMore: false, loadError: '' },
  onLoad(query) {
    this.matchId = query.matchId;
    if (!this.matchId) return this.setData({ loading: false, loadError: '缺少约局信息' });
    this.loadPage(1, false);
  },
  onShow() {
    this._active=true;
    this._stopRealtime=realtime.subscribe(event=>{
      if(event.type==='disconnected')return;
      if(event.data && event.data.matchId && String(event.data.matchId)!==String(this.matchId))return;
      clearTimeout(this._eventTimer);this._eventTimer=setTimeout(()=>{if(this._active&&this.matchId)this.loadPage(1,false);},100);
    });
    if(this.matchId && this._loaded)this.loadPage(1,false);
  },
  onHide(){this._active=false;if(this._stopRealtime)this._stopRealtime();this._stopRealtime=null;clearTimeout(this._eventTimer);clearTimeout(this._reconcileTimer);},
  onUnload(){this.onHide();this._requestId=(this._requestId||0)+1;},
  onPullDownRefresh() { if (this.matchId) this.loadPage(1, false).finally(() => wx.stopPullDownRefresh()); },
  onReachBottom() {
    if (!this.data.loading && !this.data.loadingMore && this.data.hasMore) this.loadPage(this.data.page + 1, true);
  },
  async loadPage(page, append) {
    if (this._loading) { if(!append)this._refreshAgain=true;return; }
    clearTimeout(this._reconcileTimer);
    this._loading = true;
    const requestId = this._requestId = (this._requestId || 0) + 1;
    this.setData(append ? { loadingMore: true } : { loading: true, loadingMore: false, loadError: '' });
    try {
      const rows = await api.getMatchConversations(this.matchId, page, 10);
      if (requestId !== this._requestId) return;
      const conversationGroups = conversationList.groupConversations(append ? this.data.conversations.concat(rows) : rows);
      const conversations = conversationGroups.reduce((all, group) => all.concat(group.conversations), []);
      this.setData({ conversationGroups, conversations,
        page, hasMore: rows.length === 10, loading: false, loadingMore: false, loadError: '' });
      this._loaded = true;
    } catch (error) {
      if (requestId === this._requestId) this.setData({ loading: false, loadingMore: false, loadError: error.message || '暂时无法加载聊天列表' });
    } finally {
      this._loading = false;
      if(this._active)this._reconcileTimer=setTimeout(()=>{if(this._active)this.loadPage(1,false);},this._refreshAgain?100:60000);
      this._refreshAgain=false;
    }
  },
  openConversation(event) { wx.navigateTo({ url: `/pages/chat/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }); },
  retry() { this.loadPage(1, false); }
});
