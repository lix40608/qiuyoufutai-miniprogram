const api = require('./api');

// 页面可见时轮询会话未读数；离开后停止，避免后台持续请求。
function start(page) {
  stop(page);
  page._unreadActive = true;
  const generation = page._unreadGeneration;
  const refresh = () => {
    if (!page._unreadActive || page._unreadGeneration !== generation) return;
    api.getConversations().then(rows => {
      if (page._unreadActive && page._unreadGeneration === generation) page.setData({ unreadCount: rows.reduce((sum, row) => sum + (Number(row.unreadCount) || 0), 0) });
    }).catch(() => {}).finally(() => {
      if (page._unreadActive && page._unreadGeneration === generation) page._unreadTimer = setTimeout(refresh, 15000);
    });
  };
  refresh();
}
function stop(page) { page._unreadGeneration = (page._unreadGeneration || 0) + 1; page._unreadActive = false; clearTimeout(page._unreadTimer); }
module.exports = { start, stop };
