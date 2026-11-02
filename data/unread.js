const api = require('./api');
const realtime = require('./realtime');

// 页面可见时轮询会话未读数；离开后停止，避免后台持续请求。
function start(page) {
  stop(page);
  page._unreadActive = true;
  const generation = page._unreadGeneration;
  let refreshing=false,again=false;
  const refresh = () => {
    if (!page._unreadActive || page._unreadGeneration !== generation) return;
    if(refreshing){again=true;return;}
    refreshing=true;clearTimeout(page._unreadTimer);
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
      if (Array.isArray(page.data.recentCreated)) page.setData({ recentCreated: page.data.recentCreated.map(row => Object.assign({}, row, { chatUnreadCount: unreadByMatchId[String(row.id)] || 0 })) });
      if (page.data.latestActive) page.setData({ latestActive: Object.assign({}, page.data.latestActive, { chatUnreadCount: unreadByMatchId[String(page.data.latestActive.id)] || 0 }) });
      if (Array.isArray(page.data.chatted)) page.setData({ chatted: page.data.chatted.map(row => Object.assign({}, row, { unreadCount: unreadByConversationId[String(row.conversationId)] || 0 })) });
      if (Array.isArray(page.data.records)) {
        const update = rows => rows.map(row => Object.assign({}, row, row.conversationId
          ? { unreadCount: unreadByConversationId[String(row.conversationId)] || 0 }
          : { chatUnreadCount: unreadByMatchId[String(row.id)] || 0 }));
        page.setData({ records: update(page.data.records), visibleRecords: update(page.data.visibleRecords || []) });
      }
    }).finally(() => {
      refreshing=false;
      if (page._unreadActive && page._unreadGeneration === generation) page._unreadTimer = setTimeout(refresh, again ? 100 : 60000);
      again=false;
    });
  };
  page._stopUnreadRealtime = realtime.subscribe(event=>{if(event.type!=='disconnected')refresh();if(event.type==='state' && page.onRealtimeState)page.onRealtimeState(event);});
  refresh();
}
function stop(page) { clearTimeout(page._recordEventTimer); if(page._stopUnreadRealtime)page._stopUnreadRealtime();page._stopUnreadRealtime=null; page._unreadGeneration = (page._unreadGeneration || 0) + 1; page._unreadActive = false; clearTimeout(page._unreadTimer); }
module.exports = { start, stop };
