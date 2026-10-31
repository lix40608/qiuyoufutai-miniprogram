function activityTime(item) {
  return Math.max(Date.parse(item.lastMessageAt || '') || 0, Date.parse(item.hostConfirmedAt || '') || 0,
    Date.parse(item.guestConfirmedAt || '') || 0, Date.parse(item.createdAt || '') || 0);
}

function hasInteraction(item) {
  return Boolean(item.lastMessageAt || item.lastMessage || item.hostConfirmedAt || item.guestConfirmedAt || item.hostConfirmed || item.guestConfirmed);
}

function presentConversation(item) {
  const activity = activityTime(item);
  const confirmationTime = Math.max(Date.parse(item.hostConfirmedAt || '') || 0, Date.parse(item.guestConfirmedAt || '') || 0);
  const messageTime = Date.parse(item.lastMessageAt || '') || (item.lastMessage ? activity : 0);
  const preview = item.lastMessage && messageTime >= confirmationTime ? item.lastMessage
    : item.hostConfirmed && item.guestConfirmed ? '双方已确认组局' : '组局确认邀请';
  return Object.assign({}, item, {
    preview,
    timeLabel: activity ? new Date(activity).toLocaleString('zh-CN') : '',
    stateLabel: item.cancelReason === 'PARTICIPANT_DELETED' ? '已过期' : item.status === 'cancelled' ? '已取消' : item.status === 'matched' ? (item.won ? '已组局' : '本次未组局') : item.displayEnded ? '已结束' : '沟通中'
  });
}

function groupConversations(rows) {
  const groups = new Map();
  rows.filter(hasInteraction).forEach(item => {
    const key = String(item.matchId);
    const activity = activityTime(item);
    const row = presentConversation(item);
    let group = groups.get(key);
    if (!group) {
      group = { matchId: item.matchId, gameType: item.gameType || '约球', venueName: item.venueName || '', startsAt: item.startsAt || '', statusLabel: row.stateLabel, conversations: [], unreadCount: 0, activityAt: 0 };
      groups.set(key, group);
    }
    group.conversations.push(row);
    group.unreadCount += Number(item.unreadCount) || 0;
    group.activityAt = Math.max(group.activityAt, activity);
  });
  return Array.from(groups.values()).map(group => Object.assign(group, {
    conversations: group.conversations.sort((a, b) => activityTime(b) - activityTime(a) || Number(b.id) - Number(a.id)),
    timeLabel: group.activityAt ? new Date(group.activityAt).toLocaleString('zh-CN') : ''
  })).sort((a, b) => b.activityAt - a.activityAt || Number(b.matchId) - Number(a.matchId));
}

module.exports = { activityTime, hasInteraction, presentConversation, groupConversations };
