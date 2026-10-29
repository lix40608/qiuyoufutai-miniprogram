const api = require('../../data/api');

Page({
  data: {
    views: [
      { label: '我发起的', value: 'created' },
      { label: '我聊过的', value: 'chatted' }
    ],
    filters: [
      { label: '全部', value: 'all' },
      { label: '编辑中', value: 'draft' },
      { label: '组局中', value: 'active' },
      { label: '已组局', value: 'matched' },
      { label: '已过期', value: 'expired' }
    ],
    activeView: 'created',
    activeFilter: 'all',
    loading: true,
    loadError: '',
    records: [],
    visibleRecords: []
  },

  onLoad(query) {
    if (query.filter === 'draft' || query.filter === 'active') this.setData({ activeView: 'created', activeFilter: query.filter });
  },

  onShow() {
    this.refreshRecords();
  },

  onPullDownRefresh() {
    this.refreshRecords();
  },

  refreshRecords() {
    const activeView = this.data.activeView;
    const requestId = this._requestId = (this._requestId || 0) + 1;
    this.setData({ loading: true, loadError: '' });
    const request = activeView === 'created' ? api.getMyMatches() : api.getChattedMatches();
    request.then((records) => {
      if (requestId !== this._requestId || this.data.activeView !== activeView) return;
      const filteredRecords = records;
      const visibleRecords = this.filterRecords(filteredRecords);
      this.setData({ records: filteredRecords, visibleRecords, loading: false });
    }).catch((error) => {
      if (requestId !== this._requestId) return;
      this.setData({ loading: false, loadError: error.message || '无法读取约局记录，请稍后重试。' });
    }).finally(() => wx.stopPullDownRefresh());
  },

  filterRecords(records) {
    return records.filter((record) => {
      if (this.data.activeView === 'chatted') return true;
      if (record.status === 'cancelled') return false;
      if (this.data.activeFilter === 'all') return true;
      if (this.data.activeFilter === 'draft') return record.status === 'draft';
      if (this.data.activeFilter === 'expired') return record.status !== 'draft' && record.displayEnded;
      if (this.data.activeFilter === 'matched') return record.status === 'matched' && !record.displayEnded;
      return record.status === 'recruiting' && !record.displayEnded;
    });
  },

  selectView(event) {
    this.setData({ activeView: event.currentTarget.dataset.value }, () => this.refreshRecords());
  },

  selectFilter(event) {
    this.setData({ activeFilter: event.currentTarget.dataset.value }, () => this.refreshRecords());
  },

  openRecord(event) {
    const { id, status, conversationId } = event.currentTarget.dataset;
    if (conversationId) return wx.navigateTo({ url: `/pages/chat/index?id=${conversationId}` });
    if (status === 'draft') {
      wx.navigateTo({ url: `/pages/publish/index?draftId=${encodeURIComponent(id)}` });
      return;
    }
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
  },

  cancelRecord(event) {
    const { id } = event.currentTarget.dataset;
    wx.showModal({
      title: '取消这场约局？',
      content: '取消后将从当前列表隐藏，历史约局和已有聊天仍会保留，聊天停止发送与确认。',
      confirmText: '确认取消',
      cancelText: '继续招募',
      success: (result) => {
        if (!result.confirm) return;
        api.cancelMatch(id).then(() => {
          this.refreshRecords();
          wx.showToast({ title: '已取消', icon: 'success' });
        }).catch((error) => wx.showModal({ title: '取消失败', content: error.message || '服务暂时不可用，状态未更改。', showCancel: false }));
      }
    });
  },

  goPublish() {
    wx.navigateTo({ url: '/pages/publish/index' });
  }
});
