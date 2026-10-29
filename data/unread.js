const api = require('./api');

// 页面可见时轮询会话未读数；离开后停止，避免后台持续请求。
function start(page) {
  stop(page);
  page._unreadActive = true;
  const generation = page._unreadGeneration;
  const refresh = () => {
    if (!page._unreadActive || page._unreadGeneration !== generation) return;
    Promise.allSettled([api.getConversations(), api.getUnreadNotificationCount()]).then(results => {
      if (!page._unreadActive || page._unreadGeneration !== generation) return;
      const conversations = results[0].status === 'fulfilled' ? results[0].value : [];
      const chatUnreadCount = conversations.reduce((sum, row) => sum + (Number(row.unreadCount) || 0), 0);
      const notificationUnreadCount = results[1].status === 'fulfilled' ? results[1].value : 0;
      const unreadByMatchId = conversations.reduce((counts, row) => {
        const matchId = String(row.matchId);
        counts[matchId] = (counts[matchId] || 0) + (Number(row.unreadCount) || 0);
        return counts;
      }, {});
      const unreadByConversationId = conversations.reduce((counts, row) => { counts[String(row.id)] = Number(row.unreadCount) || 0; return counts; }, {});
      page.setData({ chatUnreadCount, notificationUnreadCount, unreadCount: chatUnreadCount + notificationUnreadCount, hasChatUnread: chatUnreadCount > 0, hasNotificationUnread: notificationUnreadCount > 0, unreadByMatchId, unreadByConversationId });
      if (Array.isArray(page.data.matches)) page.setData({ matches: page.data.matches.map(row => Object.assign({}, row, { chatUnreadCount: unreadByMatchId[String(row.id)] || 0 })) });
      if (page.data.latestActive) page.setData({ latestActive: Object.assign({}, page.data.latestActive, { chatUnreadCount: unreadByMatchId[String(page.data.latestActive.id)] || 0 }) });
      if (Array.isArray(page.data.chatted)) page.setData({ chatted: page.data.chatted.map(row => Object.assign({}, row, { unreadCount: unreadByConversationId[String(row.conversationId)] || 0 })) });
    }).finally(() => {
      if (page._unreadActive && page._unreadGeneration === generation) page._unreadTimer = setTimeout(refresh, 15000);
    });
  };
  refresh();
}
function stop(page) { page._unreadGeneration = (page._unreadGeneration || 0) + 1; page._unreadActive = false; clearTimeout(page._unreadTimer); }
module.exports = { start, stop };
